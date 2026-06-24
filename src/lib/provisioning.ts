import "server-only";

import type { ProvisioningJob } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  appendLog,
  ensureProvisioningCapacity,
  getMissingProductionConfig,
  getProvisioningConfig,
  type ProvisioningConfig,
} from "@/lib/provisioning-capacity";
import {
  createRemoteConfigProfile,
  createRemoteHost,
  createRemoteInternalSquad,
  createRemoteNode,
} from "@/lib/remnawave";
import { slugify } from "@/lib/utils";

type AezaServerInfo = {
  id: string | null;
  ip: string | null;
};

const state = globalThis as typeof globalThis & {
  __oneVpnProvisioningSweep?: Promise<ProvisioningRunResult>;
};

const HYSTERIA_BBR_CONFIG = {
  log: {
    loglevel: "debug",
  },
  dns: {
    servers: ["1.1.1.1", "8.8.8.8"],
    queryStrategy: "UseIPv4",
  },
  inbounds: [
    {
      tag: "HYSTERIA-BBR",
      port: 443,
      listen: "0.0.0.0",
      protocol: "hysteria",
      settings: {
        clients: [],
        version: 2,
      },
      streamSettings: {
        network: "hysteria",
        security: "tls",
        finalmask: {
          quicParams: {
            debug: true,
            congestion: "reno",
            maxIdleTimeout: 60,
            keepAlivePeriod: 10,
            disablePathMTUDiscovery: true,
          },
        },
        tlsSettings: {
          alpn: ["h3"],
          maxVersion: "1.3",
          minVersion: "1.3",
          certificates: [
            {
              keyFile: "/var/lib/remnawave/configs/xray/ssl/cert.key",
              certificateFile: "/var/lib/remnawave/configs/xray/ssl/cert.pem",
            },
          ],
        },
        hysteriaSettings: {
          version: 2,
          udpIdleTimeout: 60,
        },
      },
    },
  ],
  outbounds: [
    {
      tag: "DIRECT",
      protocol: "freedom",
      settings: {
        domainStrategy: "UseIPv4",
      },
    },
    {
      tag: "BLOCK",
      protocol: "blackhole",
    },
  ],
  routing: {
    rules: [
      {
        ip: ["geoip:private"],
        outboundTag: "BLOCK",
      },
      {
        domain: ["geosite:private"],
        outboundTag: "BLOCK",
      },
      {
        protocol: ["bittorrent"],
        outboundTag: "BLOCK",
      },
    ],
    domainStrategy: "IPIfNonMatch",
  },
};

export type ProvisioningRunResult = {
  ok: boolean;
  message: string;
  processed: number;
  createdJobs: number;
  errors: string[];
};

export async function getProvisioningOverview() {
  const config = getProvisioningConfig();
  const jobs = await db.provisioningJob.findMany({
    orderBy: [{ createdAt: "asc" }],
  });

  return {
    config,
    jobs,
    missing: getMissingProductionConfig(config),
  };
}

async function updateJobLog(
  job: ProvisioningJob,
  message: string,
  details?: Record<string, unknown>,
) {
  return db.provisioningJob.update({
    where: { id: job.id },
    data: {
      logs: appendLog(job.logs, message, details),
      lastError: null,
    },
  });
}

async function updateJobError(job: ProvisioningJob, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown provisioning error";

  return db.provisioningJob.update({
    where: { id: job.id },
    data: {
      lastError: message.slice(0, 800),
      logs: appendLog(job.logs, "Step failed", { error: message.slice(0, 800) }),
    },
  });
}

export async function runProvisioningSweep(): Promise<ProvisioningRunResult> {
  if (state.__oneVpnProvisioningSweep) {
    return state.__oneVpnProvisioningSweep;
  }

  const sweep = executeProvisioningSweep();
  state.__oneVpnProvisioningSweep = sweep;

  try {
    return await sweep;
  } finally {
    if (state.__oneVpnProvisioningSweep === sweep) {
      state.__oneVpnProvisioningSweep = undefined;
    }
  }
}

async function executeProvisioningSweep(): Promise<ProvisioningRunResult> {
  const config = getProvisioningConfig();

  if (!config.enabled) {
    return {
      ok: true,
      message: "Auto provisioning is disabled.",
      processed: 0,
      createdJobs: 0,
      errors: [],
    };
  }

  if (!config.targets.length) {
    return {
      ok: false,
      message: "No provisioning targets configured.",
      processed: 0,
      createdJobs: 0,
      errors: ["Set AEZA_PRODUCT_ID_* or AUTO_PROVISION_TARGETS in .env."],
    };
  }

  const missing = getMissingProductionConfig(config);
  if (missing.length) {
    return {
      ok: false,
      message: "Auto provisioning is missing required production config.",
      processed: 0,
      createdJobs: 0,
      errors: missing,
    };
  }

  const createdJobs = await ensureProvisioningCapacity(config);
  const jobs = await db.provisioningJob.findMany({
    where: {
      NOT: {
        status: "ACTIVE",
      },
    },
    orderBy: [{ updatedAt: "asc" }],
    take: config.batchSize,
  });

  let processed = 0;
  const errors: string[] = [];

  for (const job of jobs) {
    try {
      await processProvisioningJob(job, config);
      processed += 1;
    } catch (error) {
      const updated = await updateJobError(job, error);
      errors.push(`${updated.nodeName}: ${updated.lastError ?? "unknown error"}`);
    }
  }

  return {
    ok: errors.length === 0,
    message: errors.length ? "Auto provisioning finished with errors." : "Auto provisioning step completed.",
    processed,
    createdJobs,
    errors,
  };
}

async function processProvisioningJob(job: ProvisioningJob, config: ProvisioningConfig) {
  if (config.dryRun) {
    await db.provisioningJob.update({
      where: { id: job.id },
      data: {
        status: "DRY_RUN",
        logs: appendLog(job.logs, "Dry run: external purchase and setup were skipped"),
      },
    });
    return;
  }

  if (job.status === "PENDING" || job.status === "DRY_RUN") {
    await orderServer(job);
    return;
  }

  if (job.status === "SERVER_ORDERED") {
    await waitForServer(job);
    return;
  }

  if (job.status === "DNS_PENDING") {
    await ensureDns(job, config);
    return;
  }

  if (job.status === "REMNAWAVE_PENDING") {
    await ensureRemnawaveResources(job, config);
    return;
  }

  if (job.status === "INSTALL_PENDING") {
    await installNode(job, config);
    return;
  }

  await updateJobLog(job, `Skipped job with status ${job.status}`);
}

async function aezaRequest<T>(path: string, init: RequestInit = {}) {
  if (!env.AEZA_API_TOKEN) {
    throw new Error("AEZA_API_TOKEN is not configured.");
  }

  const response = await fetch(`https://core.aeza.net/api/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.AEZA_API_TOKEN,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String(payload.message)
        : response.statusText;
    throw new Error(`Aeza API ${response.status}: ${message}`);
  }

  return payload as T;
}

function getAezaOrderParameters() {
  if (env.AEZA_ORDER_PARAMETERS_JSON) {
    return JSON.parse(env.AEZA_ORDER_PARAMETERS_JSON) as Record<string, unknown>;
  }

  return {
    recipe: env.AEZA_RECIPE ?? null,
    os: env.AEZA_OS_ID ?? 940,
    isoUrl: "",
  };
}

function toProviderProductId(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function isIPv4(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value)
  );
}

function findDeep(value: unknown, keys: string[]): unknown {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDeep(item, keys);
      if (found) {
        return found;
      }
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (record[key]) {
      return record[key];
    }
  }

  for (const item of Object.values(record)) {
    const found = findDeep(item, keys);
    if (found) {
      return found;
    }
  }

  return null;
}

function extractServerInfo(payload: unknown): AezaServerInfo {
  const id = findDeep(payload, ["serviceId", "service_id", "serverId", "server_id", "id"]);
  const ip = findDeep(payload, ["ip", "ipv4", "mainIp", "main_ip"]);

  return {
    id: typeof id === "string" || typeof id === "number" ? String(id) : null,
    ip: isIPv4(ip) ? ip : null,
  };
}

function extractOrderId(payload: unknown) {
  const orderId = findDeep(payload, ["orderId", "order_id", "transactionId", "transaction_id"]);
  return typeof orderId === "string" || typeof orderId === "number" ? String(orderId) : null;
}

async function findAezaServerByName(name: string): Promise<AezaServerInfo | null> {
  const payload = await aezaRequest<unknown>("services", { method: "GET" });
  const items = findDeep(payload, ["items"]);
  const servers = Array.isArray(items) ? items : [];

  for (const server of servers) {
    if (!server || typeof server !== "object") {
      continue;
    }

    const record = server as Record<string, unknown>;
    if (record.name === name || record.title === name) {
      return extractServerInfo(record);
    }
  }

  return null;
}

async function orderServer(job: ProvisioningJob) {
  const existing = await findAezaServerByName(job.nodeName);
  if (existing?.id || existing?.ip) {
    await db.provisioningJob.update({
      where: { id: job.id },
      data: {
        status: existing.ip ? "DNS_PENDING" : "SERVER_ORDERED",
        serverId: existing.id,
        serverIp: existing.ip,
        logs: appendLog(job.logs, "Adopted existing Aeza server", existing),
      },
    });
    return;
  }

  const payload = await aezaRequest<unknown>("services/orders", {
    method: "POST",
    body: JSON.stringify({
      count: 1,
      method: "balance",
      productId: toProviderProductId(job.productId),
      term: env.AEZA_TERM ?? "month",
      autoProlong: env.AEZA_AUTO_PROLONG === "true",
      name: job.nodeName,
      parameters: getAezaOrderParameters(),
    }),
  });
  const server = extractServerInfo(payload);
  const orderId = extractOrderId(payload);

  await db.provisioningJob.update({
    where: { id: job.id },
    data: {
      status: server.ip ? "DNS_PENDING" : "SERVER_ORDERED",
      orderId,
      serverId: server.id,
      serverIp: server.ip,
      logs: appendLog(job.logs, "Aeza server order created", {
        orderId,
        serverId: server.id,
        hasIp: Boolean(server.ip),
      }),
    },
  });
}

async function waitForServer(job: ProvisioningJob) {
  const payload = job.serverId
    ? await aezaRequest<unknown>(`services/${job.serverId}`, { method: "GET" })
    : await aezaRequest<unknown>("services", { method: "GET" });
  const server = extractServerInfo(payload);

  if (!server.id && !server.ip) {
    throw new Error("Aeza server is not visible yet. Try again in a minute.");
  }

  await db.provisioningJob.update({
    where: { id: job.id },
    data: {
      status: server.ip ? "DNS_PENDING" : "SERVER_ORDERED",
      serverId: job.serverId ?? server.id,
      serverIp: server.ip ?? job.serverIp,
      logs: appendLog(job.logs, "Aeza server status checked", {
        serverId: job.serverId ?? server.id,
        hasIp: Boolean(server.ip ?? job.serverIp),
      }),
    },
  });
}

async function timewebRequest<T>(path: string, init: RequestInit = {}) {
  if (!env.TIMEWEB_CLOUD_TOKEN) {
    throw new Error("TIMEWEB_CLOUD_TOKEN is not configured.");
  }

  const response = await fetch(`https://api.timeweb.cloud${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.TIMEWEB_CLOUD_TOKEN}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String(payload.message)
        : response.statusText;
    throw new Error(`Timeweb API ${response.status}: ${message}`);
  }

  return payload as T;
}

function getDnsRecords(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const direct = record.dns_records ?? record.records ?? record.items;
  return Array.isArray(direct) ? direct : [];
}

function readDnsRecord(record: unknown) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const item = record as Record<string, unknown>;
  const data = item.data && typeof item.data === "object" ? (item.data as Record<string, unknown>) : {};

  return {
    id: typeof item.id === "string" || typeof item.id === "number" ? String(item.id) : null,
    type: String(item.type ?? ""),
    subdomain: String(data.subdomain ?? item.subdomain ?? ""),
    value: String(data.value ?? item.value ?? ""),
  };
}

async function ensureDns(job: ProvisioningJob, config: ProvisioningConfig) {
  if (!job.serverIp) {
    throw new Error("Server IP is missing.");
  }

  const list = await timewebRequest<unknown>(
    `/api/v1/domains/${encodeURIComponent(config.timewebDomain)}/dns-records?limit=100&offset=0`,
    { method: "GET" },
  );
  const existing = getDnsRecords(list)
    .map(readDnsRecord)
    .find(
      (record) =>
        record &&
        record.type === "A" &&
        (record.subdomain === job.fqdn || record.subdomain === job.subdomain),
    );

  if (existing?.id && existing.value !== job.serverIp) {
    await timewebRequest(
      `/api/v2/domains/${encodeURIComponent(job.fqdn)}/dns-records/${existing.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          type: "A",
          value: job.serverIp,
          ttl: config.timewebTtl,
        }),
      },
    );
  } else if (!existing?.id) {
    await timewebRequest(`/api/v2/domains/${encodeURIComponent(job.fqdn)}/dns-records`, {
      method: "POST",
      body: JSON.stringify({
        type: "A",
        value: job.serverIp,
        ttl: config.timewebTtl,
      }),
    });
  }

  await db.provisioningJob.update({
    where: { id: job.id },
    data: {
      status: "REMNAWAVE_PENDING",
      logs: appendLog(job.logs, "Timeweb DNS A record is ready", {
        fqdn: job.fqdn,
        ip: job.serverIp,
      }),
    },
  });
}

function getInboundUuid(profile: Awaited<ReturnType<typeof createRemoteConfigProfile>>) {
  const inbound = profile.inbounds.find((item) => item.tag === "HYSTERIA-BBR") ?? profile.inbounds[0];

  if (!inbound?.uuid) {
    throw new Error("Remnawave did not return an inbound UUID for the new profile.");
  }

  return inbound.uuid;
}

async function ensureRemnawaveResources(job: ProvisioningJob, config: ProvisioningConfig) {
  const groupJobs = job.groupKey
    ? await db.provisioningJob.findMany({
        where: { groupKey: job.groupKey },
        orderBy: [{ nodeIndex: "asc" }, { createdAt: "asc" }],
      })
    : [job];
  const groupWhere = job.groupKey ? { groupKey: job.groupKey } : { id: job.id };
  const groupLabel = job.groupIndex ? `Squad ${job.groupIndex}` : job.nodeName;

  let profileUuid =
    groupJobs.find((item) => item.remnawaveConfigProfileUuid)?.remnawaveConfigProfileUuid ??
    job.remnawaveConfigProfileUuid;
  let inboundUuid =
    groupJobs.find((item) => item.remnawaveInboundUuid)?.remnawaveInboundUuid ??
    job.remnawaveInboundUuid;
  let nodeUuid = job.remnawaveNodeUuid;
  let hostUuid = job.remnawaveHostUuid;
  let squadUuid =
    groupJobs.find((item) => item.remnawaveInternalSquadUuid)?.remnawaveInternalSquadUuid ??
    job.remnawaveInternalSquadUuid;
  let squadId = groupJobs.find((item) => item.squadId)?.squadId ?? job.squadId;
  let logs = job.logs;

  if (!profileUuid || !inboundUuid) {
    const profile = await createRemoteConfigProfile({
      name: `${groupLabel} Hysteria`,
      config: HYSTERIA_BBR_CONFIG,
    });
    profileUuid = profile.uuid;
    inboundUuid = getInboundUuid(profile);
    logs = appendLog(logs, "Remnawave config profile created", { profileUuid, inboundUuid });
  }

  if (!squadUuid) {
    const remoteSquad = await createRemoteInternalSquad({
      name: `${groupLabel} internal`,
      inbounds: [inboundUuid],
    });
    squadUuid = remoteSquad.uuid;
    logs = appendLog(logs, "Remnawave internal squad created", { squadUuid });
  }

  if (!squadId) {
    const existing = await db.squad.findUnique({
      where: { remnawaveInternalSquadUuid: squadUuid },
      select: { id: true },
    });

    if (existing) {
      squadId = existing.id;
    } else {
      const position = (await db.squad.count()) + 1;
      const name = `${groupLabel} auto`;
      const squad = await db.squad.create({
        data: {
          name,
          slug: slugify(`${name}-${squadUuid.slice(0, 8)}-${Date.now().toString(36)}`),
          memberLimit: config.memberLimit,
          position,
          isActive: true,
          remnawaveInternalSquadUuid: squadUuid,
        },
      });
      squadId = squad.id;
    }
  } else {
    await db.squad.update({
      where: { id: squadId },
      data: {
        isActive: true,
        remnawaveInternalSquadUuid: squadUuid,
      },
    });
  }

  await db.provisioningJob.updateMany({
    where: groupWhere,
    data: {
      remnawaveConfigProfileUuid: profileUuid,
      remnawaveInboundUuid: inboundUuid,
      remnawaveInternalSquadUuid: squadUuid,
      squadId,
    },
  });

  if (!nodeUuid) {
    const node = await createRemoteNode({
      name: job.nodeName,
      address: job.fqdn,
      port: config.nodePort,
      countryCode: job.countryCode,
      activeConfigProfileUuid: profileUuid,
      activeInbounds: [inboundUuid],
    });
    nodeUuid = node.uuid;
    logs = appendLog(logs, "Remnawave node created", { nodeUuid });
  }

  if (!hostUuid) {
    const host = await createRemoteHost({
      remark: `${job.countryCode} ${job.nodeName}`,
      address: job.fqdn,
      port: config.hostPort,
      configProfileUuid: profileUuid,
      configProfileInboundUuid: inboundUuid,
      nodeUuid,
      internalSquadUuid: squadUuid,
    });
    hostUuid = host.uuid;
    logs = appendLog(logs, "Remnawave host created", { hostUuid });
  }

  logs = appendLog(logs, "Local squad is ready", { squadId });

  await db.provisioningJob.update({
    where: { id: job.id },
    data: {
      status: "INSTALL_PENDING",
      remnawaveConfigProfileUuid: profileUuid,
      remnawaveInboundUuid: inboundUuid,
      remnawaveNodeUuid: nodeUuid,
      remnawaveHostUuid: hostUuid,
      remnawaveInternalSquadUuid: squadUuid,
      squadId,
      logs,
    },
  });
}

function quoteShell(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildInstallScript(job: ProvisioningJob, config: ProvisioningConfig) {
  if (!env.AUTO_PROVISION_CERTBOT_EMAIL) {
    throw new Error("AUTO_PROVISION_CERTBOT_EMAIL is not configured.");
  }

  if (!env.AUTO_PROVISION_REMNANODE_SECRET_KEY) {
    throw new Error("AUTO_PROVISION_REMNANODE_SECRET_KEY is not configured.");
  }

  const dockerLogin =
    env.AUTO_PROVISION_DOCKER_USERNAME && env.AUTO_PROVISION_DOCKER_TOKEN
      ? `
printf %s ${quoteShell(env.AUTO_PROVISION_DOCKER_TOKEN)} | docker login -u ${quoteShell(env.AUTO_PROVISION_DOCKER_USERNAME)} --password-stdin
`
      : "";
  const firewall =
    env.AUTO_PROVISION_PANEL_IP
      ? `
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw allow 443/udp || true
  ufw allow from ${quoteShell(env.AUTO_PROVISION_PANEL_IP)} to any port ${config.nodePort} proto tcp || true
fi
`
      : "";

  return `#!/usr/bin/env bash
set -Eeuo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg openssl certbot

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

${dockerLogin}
${firewall}

mkdir -p /opt/remnanode /var/lib/remnawave/configs/xray/ssl /etc/letsencrypt/renewal-hooks/deploy

certbot certonly --standalone --non-interactive --agree-tos --email ${quoteShell(
    env.AUTO_PROVISION_CERTBOT_EMAIL,
  )} -d ${quoteShell(job.fqdn)}

cp /etc/letsencrypt/live/${quoteShell(job.fqdn)}/privkey.pem /var/lib/remnawave/configs/xray/ssl/cert.key
cp /etc/letsencrypt/live/${quoteShell(job.fqdn)}/fullchain.pem /var/lib/remnawave/configs/xray/ssl/cert.pem
chmod 644 /var/lib/remnawave/configs/xray/ssl/cert.key /var/lib/remnawave/configs/xray/ssl/cert.pem

cat >/etc/letsencrypt/renewal-hooks/deploy/remnanode-copy-cert.sh <<'HOOK'
#!/usr/bin/env bash
set -e
DOMAIN="\${RENEWED_DOMAINS%% *}"
if [ -n "$DOMAIN" ] && [ -f "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ]; then
  cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" /var/lib/remnawave/configs/xray/ssl/cert.key
  cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" /var/lib/remnawave/configs/xray/ssl/cert.pem
  chmod 644 /var/lib/remnawave/configs/xray/ssl/cert.key /var/lib/remnawave/configs/xray/ssl/cert.pem
  cd /opt/remnanode && docker compose restart remnanode || true
fi
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/remnanode-copy-cert.sh

cat >/opt/remnanode/docker-compose.yml <<'YAML'
services:
  remnanode:
    container_name: remnanode
    hostname: remnanode
    image: remnawave/node:latest
    network_mode: host
    restart: always
    volumes:
      - /var/lib/remnawave/configs/xray/ssl:/var/lib/remnawave/configs/xray/ssl:ro
    cap_add:
      - NET_ADMIN
    ulimits:
      nofile:
        soft: 1048576
        hard: 1048576
    environment:
      - NODE_PORT=${config.nodePort}
      - SECRET_KEY=${env.AUTO_PROVISION_REMNANODE_SECRET_KEY}
YAML

cd /opt/remnanode
docker compose pull
docker compose up -d
docker compose ps
`;
}

async function runSshScript(host: string, script: string) {
  const keyPath = env.AUTO_PROVISION_SSH_PRIVATE_KEY_PATH;
  if (!keyPath) {
    throw new Error("AUTO_PROVISION_SSH_PRIVATE_KEY_PATH is not configured.");
  }

  const { spawn } = await import("node:child_process");
  const user = env.AUTO_PROVISION_SSH_USER ?? "root";
  const timeoutMs = (env.AUTO_PROVISION_SSH_CONNECT_TIMEOUT_SECONDS ?? 20) * 1000;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "ssh",
      [
        "-i",
        keyPath,
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        `ConnectTimeout=${Math.ceil(timeoutMs / 1000)}`,
        `${user}@${host}`,
        "bash -s",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("SSH install timed out."));
    }, Math.max(timeoutMs, 10_000) + 20 * 60 * 1000);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `SSH install failed with code ${code}. ${Buffer.concat(stderr)
            .toString("utf8")
            .slice(-1200) || Buffer.concat(stdout).toString("utf8").slice(-1200)}`,
        ),
      );
    });

    child.stdin.end(script);
  });
}

async function installNode(job: ProvisioningJob, config: ProvisioningConfig) {
  if (!job.serverIp) {
    throw new Error("Server IP is missing.");
  }

  await updateJobLog(job, "Starting remote node installation", {
    host: job.serverIp,
    fqdn: job.fqdn,
  });
  await runSshScript(job.serverIp, buildInstallScript(job, config));

  const latest = await db.provisioningJob.findUniqueOrThrow({ where: { id: job.id } });
  await db.provisioningJob.update({
    where: { id: job.id },
    data: {
      status: "ACTIVE",
      logs: appendLog(latest.logs, "Remote node installation completed"),
    },
  });
}
