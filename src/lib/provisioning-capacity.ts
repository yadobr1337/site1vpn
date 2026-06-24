import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { DEFAULT_SQUAD_MEMBER_LIMIT } from "@/lib/site";
import { slugify } from "@/lib/utils";

export type ProvisioningTarget = {
  locationKey: string;
  locationName: string;
  countryCode: string;
  nodeName: string;
  subdomain: string;
  productId: string;
};

type ProvisioningLocation = {
  locationKey: string;
  locationName: string;
  countryCode: string;
  productId: string;
};

export type ProvisioningConfig = {
  enabled: boolean;
  dryRun: boolean;
  targets: ProvisioningTarget[];
  domain: string;
  memberLimit: number;
  maxServers: number;
  nodesPerSquad: number;
  batchSize: number;
  nodePort: number;
  hostPort: number;
  timewebDomain: string;
  timewebTtl: number;
};

const PROVISIONING_GROUP_PREFIX = "auto-squad";

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (!value) {
    return defaultValue;
  }

  return value === "true";
}

function parseTargetLine(line: string): ProvisioningTarget | null {
  const parts = line
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length !== 6) {
    return null;
  }

  const [locationKey, locationName, countryCode, nodeName, subdomain, productId] = parts;
  if (!locationKey || !locationName || !countryCode || !nodeName || !subdomain || !productId) {
    return null;
  }

  return {
    locationKey,
    locationName,
    countryCode: countryCode.toUpperCase(),
    nodeName,
    subdomain,
    productId,
  };
}

function getDefaultLocations(): ProvisioningLocation[] {
  return [
    env.AEZA_PRODUCT_ID_AMSTERDAM
      ? {
          locationKey: "amsterdam",
          locationName: "Amsterdam",
          countryCode: "NL",
          productId: env.AEZA_PRODUCT_ID_AMSTERDAM,
        }
      : null,
    env.AEZA_PRODUCT_ID_VIENNA
      ? {
          locationKey: "vienna",
          locationName: "Vienna",
          countryCode: "AT",
          productId: env.AEZA_PRODUCT_ID_VIENNA,
        }
      : null,
    env.AEZA_PRODUCT_ID_HELSINKI
      ? {
          locationKey: "helsinki",
          locationName: "Helsinki",
          countryCode: "FI",
          productId: env.AEZA_PRODUCT_ID_HELSINKI,
        }
      : null,
  ].filter(Boolean) as ProvisioningLocation[];
}

function buildGeneratedTargets(maxServers: number) {
  const locations = getDefaultLocations();
  const targets: ProvisioningTarget[] = [];

  if (!locations.length) {
    return targets;
  }

  for (let index = 0; index < maxServers; index += 1) {
    const location = locations[index % locations.length];
    const nodeNumber = index + 1;
    const nodeName = `nd${nodeNumber}`;
    const locationKey =
      nodeNumber <= locations.length ? location.locationKey : `${location.locationKey}-${nodeNumber}`;

    targets.push({
      ...location,
      locationKey,
      nodeName,
      subdomain: nodeName,
    });
  }

  return targets;
}

export function getProvisioningConfig(): ProvisioningConfig {
  const configuredTargets = env.AUTO_PROVISION_TARGETS?.split(",")
    .map(parseTargetLine)
    .filter(Boolean) as ProvisioningTarget[] | undefined;
  const domain = env.AUTO_PROVISION_DOMAIN ?? "the1vpn.ru";
  const nodesPerSquad = env.AUTO_PROVISION_NODES_PER_SQUAD ?? 3;
  const maxServers = env.AUTO_PROVISION_MAX_SERVERS ?? nodesPerSquad * 10;

  return {
    enabled: env.AUTO_PROVISION_ENABLED === "true",
    dryRun: parseBoolean(env.AUTO_PROVISION_DRY_RUN, true),
    targets: (configuredTargets?.length ? configuredTargets : buildGeneratedTargets(maxServers)).slice(
      0,
      maxServers,
    ),
    domain,
    memberLimit: env.AUTO_PROVISION_MEMBER_LIMIT ?? DEFAULT_SQUAD_MEMBER_LIMIT,
    maxServers,
    nodesPerSquad,
    batchSize: env.AUTO_PROVISION_BATCH_SIZE ?? 1,
    nodePort: env.AUTO_PROVISION_NODE_PORT ?? 2222,
    hostPort: env.AUTO_PROVISION_HOST_PORT ?? 443,
    timewebDomain: env.TIMEWEB_DOMAIN ?? domain,
    timewebTtl: env.TIMEWEB_DNS_TTL ?? 600,
  };
}

export function getMissingProductionConfig(config: ProvisioningConfig = getProvisioningConfig()) {
  if (!config.enabled || config.dryRun) {
    return [];
  }

  const required: Array<[string, string | number | undefined]> = [
    ["AEZA_API_TOKEN", env.AEZA_API_TOKEN],
    ["TIMEWEB_CLOUD_TOKEN", env.TIMEWEB_CLOUD_TOKEN],
    ["REMNAWAVE_BASE_URL", env.REMNAWAVE_BASE_URL],
    ["REMNAWAVE_API_TOKEN", env.REMNAWAVE_API_TOKEN],
    ["AUTO_PROVISION_CERTBOT_EMAIL", env.AUTO_PROVISION_CERTBOT_EMAIL],
    ["AUTO_PROVISION_REMNANODE_SECRET_KEY", env.AUTO_PROVISION_REMNANODE_SECRET_KEY],
    ["AUTO_PROVISION_SSH_PRIVATE_KEY_PATH", env.AUTO_PROVISION_SSH_PRIVATE_KEY_PATH],
  ];

  return required
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

export function appendLog(
  logs: Prisma.JsonValue | null,
  message: string,
  details?: Record<string, unknown>,
) {
  const current = Array.isArray(logs) ? logs : [];
  const safeDetails = JSON.parse(JSON.stringify(details ?? {})) as Prisma.JsonObject;

  return [
    ...current.slice(-49),
    {
      at: new Date().toISOString(),
      message,
      details: safeDetails,
    },
  ] as Prisma.JsonArray;
}

function getMaxProvisioningGroups(config: ProvisioningConfig) {
  return Math.floor(config.maxServers / config.nodesPerSquad);
}

function getProvisioningGroupKey(groupIndex: number) {
  return `${PROVISIONING_GROUP_PREFIX}-${groupIndex}`;
}

function getNodeNumber(groupIndex: number, nodeIndex: number, config: ProvisioningConfig) {
  return (groupIndex - 1) * config.nodesPerSquad + nodeIndex;
}

function buildGroupTargets(config: ProvisioningConfig, groupIndex: number) {
  return Array.from({ length: config.nodesPerSquad }, (_, index) => {
    const target = config.targets[index % config.targets.length];
    const nodeIndex = index + 1;
    const nodeNumber = getNodeNumber(groupIndex, nodeIndex, config);
    const nodeName = `nd${nodeNumber}`;

    return {
      ...target,
      nodeIndex,
      nodeName,
      subdomain: nodeName,
      locationKey: `${getProvisioningGroupKey(groupIndex)}-${target.locationKey}-${nodeIndex}`,
    };
  });
}

async function getNextProvisioningGroupIndex(
  tx: Prisma.TransactionClient,
  config: ProvisioningConfig,
) {
  const latestGroup = await tx.provisioningJob.findFirst({
    where: {
      groupIndex: {
        not: null,
      },
    },
    orderBy: {
      groupIndex: "desc",
    },
    select: {
      groupIndex: true,
    },
  });

  if (latestGroup?.groupIndex) {
    return latestGroup.groupIndex + 1;
  }

  const existingJobs = await tx.provisioningJob.findMany({
    select: {
      nodeName: true,
    },
  });
  const maxNodeNumber = existingJobs.reduce((max, job) => {
    const match = /^nd(\d+)$/i.exec(job.nodeName);
    const nodeNumber = match ? Number(match[1]) : 0;
    return Number.isFinite(nodeNumber) ? Math.max(max, nodeNumber) : max;
  }, 0);

  return maxNodeNumber > 0 ? Math.ceil(maxNodeNumber / config.nodesPerSquad) + 1 : 1;
}

async function hasAvailableSquad(tx: Prisma.TransactionClient = db) {
  const squads = await tx.squad.findMany({
    where: { isActive: true },
    include: {
      _count: {
        select: { users: true },
      },
    },
  });

  return squads.some((squad) => squad._count.users < squad.memberLimit);
}

export async function createProvisioningSquadForCapacity(
  tx: Prisma.TransactionClient = db,
  options: { requireProduction?: boolean } = {},
) {
  const config = getProvisioningConfig();

  if (!config.enabled || !config.targets.length) {
    return null;
  }

  if (options.requireProduction && (config.dryRun || getMissingProductionConfig(config).length)) {
    return null;
  }

  const groupIndex = await getNextProvisioningGroupIndex(tx, config);
  const maxGroups = getMaxProvisioningGroups(config);
  if (groupIndex > maxGroups) {
    return null;
  }

  const groupKey = getProvisioningGroupKey(groupIndex);
  const existingGroupJob = await tx.provisioningJob.findFirst({
    where: { groupKey },
    select: { squadId: true },
  });

  if (existingGroupJob?.squadId) {
    return tx.squad.findUnique({ where: { id: existingGroupJob.squadId } });
  }

  const position = (await tx.squad.count()) + 1;
  const name = `Provisioned Squad ${groupIndex}`;
  const squad = await tx.squad.create({
    data: {
      name,
      slug: slugify(`${name}-${Date.now().toString(36)}`),
      memberLimit: config.memberLimit,
      position,
      isActive: !config.dryRun,
    },
  });

  const targets = buildGroupTargets(config, groupIndex);
  for (const target of targets) {
    const fqdn = `${target.subdomain}.${config.domain}`;
    await tx.provisioningJob.create({
      data: {
        groupKey,
        groupIndex,
        nodeIndex: target.nodeIndex,
        locationKey: target.locationKey,
        locationName: target.locationName,
        countryCode: target.countryCode,
        nodeName: target.nodeName,
        subdomain: target.subdomain,
        fqdn,
        productId: target.productId,
        squadId: squad.id,
        logs: appendLog(null, "Provisioning group job created", {
          groupKey,
          groupIndex,
          nodeIndex: target.nodeIndex,
        }),
      },
    });
  }

  return squad;
}

export async function ensureProvisioningCapacity(config: ProvisioningConfig) {
  if (await hasAvailableSquad()) {
    return 0;
  }

  const created = await createProvisioningSquadForCapacity(db);
  return created ? config.nodesPerSquad : 0;
}
