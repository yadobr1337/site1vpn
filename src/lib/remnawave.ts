import {
  CreateConfigProfileCommand,
  CreateHostCommand,
  CreateInternalSquadCommand,
  CreateNodeCommand,
  CreateUserCommand,
  DeleteUserCommand,
  DeleteUserHwidDeviceCommand,
  DisableUserCommand,
  EnableUserCommand,
  GetInternalSquadByUuidCommand,
  GetRemnawaveHealthCommand,
  GetUserHwidDevicesCommand,
  UpdateUserCommand,
} from "@remnawave/backend-contract";
import type { Squad, User } from "@prisma/client";
import { env } from "@/lib/env";

function isConfigured() {
  return Boolean(env.REMNAWAVE_BASE_URL && env.REMNAWAVE_API_TOKEN);
}

export type RemnawaveConnectionStatus = {
  state: "connected" | "error" | "not_configured";
  checkedAt: string;
  baseUrl: string | null;
  latencyMs: number | null;
  instanceCount: number | null;
  uptimeSeconds: number | null;
  message: string;
};

async function remnawaveRequest<T>({
  path,
  method,
  body,
  signal,
}: {
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}) {
  if (!isConfigured()) {
    throw new Error("Remnawave is not configured.");
  }

  const response = await fetch(new URL(path, env.REMNAWAVE_BASE_URL).toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.REMNAWAVE_API_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const responseText = await response.text();
    let message = responseText;

    try {
      const payload = JSON.parse(responseText) as {
        message?: string | string[];
        error?: string;
      };
      message = Array.isArray(payload.message)
        ? payload.message.join("; ")
        : payload.message ?? payload.error ?? responseText;
    } catch {
      // Keep the original response text when the panel did not return JSON.
    }

    throw new Error(`Remnawave API ${response.status}: ${message || response.statusText}`);
  }

  return (await response.json()) as T;
}

function getConnectionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Неизвестная ошибка подключения.";
  }

  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return "Панель не ответила за 8 секунд.";
  }

  const causeMessage =
    error.cause instanceof Error && error.cause.message ? `: ${error.cause.message}` : "";
  return `${error.message}${causeMessage}`.slice(0, 300);
}

export async function checkRemnawaveConnection(): Promise<RemnawaveConnectionStatus> {
  const checkedAt = new Date().toISOString();
  const baseUrl = env.REMNAWAVE_BASE_URL ? new URL(env.REMNAWAVE_BASE_URL).origin : null;

  if (!isConfigured()) {
    return {
      state: "not_configured",
      checkedAt,
      baseUrl,
      latencyMs: null,
      instanceCount: null,
      uptimeSeconds: null,
      message: "Укажите REMNAWAVE_BASE_URL и REMNAWAVE_API_TOKEN в .env.",
    };
  }

  const startedAt = performance.now();

  try {
    const result = await remnawaveRequest<GetRemnawaveHealthCommand.Response>({
      path: GetRemnawaveHealthCommand.url,
      method: "GET",
      signal: AbortSignal.timeout(8_000),
    });
    const health = GetRemnawaveHealthCommand.ResponseSchema.parse(result).response;

    return {
      state: "connected",
      checkedAt,
      baseUrl,
      latencyMs: Math.round(performance.now() - startedAt),
      instanceCount: health.runtimeMetrics.length,
      uptimeSeconds: health.runtimeMetrics.length
        ? Math.max(...health.runtimeMetrics.map((metric) => metric.uptime))
        : null,
      message: "Панель Remnawave отвечает, API-токен принят.",
    };
  } catch (error) {
    return {
      state: "error",
      checkedAt,
      baseUrl,
      latencyMs: Math.round(performance.now() - startedAt),
      instanceCount: null,
      uptimeSeconds: null,
      message: getConnectionErrorMessage(error),
    };
  }
}

export async function getRemoteInternalSquad(squadUuid: string) {
  if (!isConfigured()) {
    return null;
  }

  GetInternalSquadByUuidCommand.RequestSchema.parse({ uuid: squadUuid });
  const result = await remnawaveRequest<GetInternalSquadByUuidCommand.Response>({
    path: GetInternalSquadByUuidCommand.url(squadUuid),
    method: "GET",
  });

  return GetInternalSquadByUuidCommand.ResponseSchema.parse(result).response;
}

function getDefaultInboundUuids() {
  return env.REMNAWAVE_DEFAULT_INBOUND_UUIDS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function ensureRemoteSquad(squad: Pick<Squad, "name" | "remnawaveInternalSquadUuid">) {
  if (!isConfigured()) {
    return null;
  }

  if (squad.remnawaveInternalSquadUuid) {
    return squad.remnawaveInternalSquadUuid;
  }

  const inbounds = getDefaultInboundUuids();
  if (!inbounds?.length) {
    return null;
  }

  const body = {
    name: squad.name,
    inbounds,
  };
  CreateInternalSquadCommand.RequestSchema.parse(body);
  const result = await remnawaveRequest<CreateInternalSquadCommand.Response>({
    path: CreateInternalSquadCommand.url,
    method: "POST",
    body,
  });

  return CreateInternalSquadCommand.ResponseSchema.parse(result).response.uuid;
}

export async function createRemoteInternalSquad(params: {
  name: string;
  inbounds: string[];
}) {
  if (!isConfigured()) {
    throw new Error("Remnawave is not configured.");
  }

  const body = {
    name: params.name,
    inbounds: params.inbounds,
  };
  CreateInternalSquadCommand.RequestSchema.parse(body);
  const result = await remnawaveRequest<CreateInternalSquadCommand.Response>({
    path: CreateInternalSquadCommand.url,
    method: "POST",
    body,
  });

  return CreateInternalSquadCommand.ResponseSchema.parse(result).response;
}

function buildRemoteUsername(user: Pick<User, "id" | "email">) {
  const local = user.email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20) || "user";
  return `${local}-${user.id.slice(-8)}`.slice(0, 36);
}

export async function provisionRemoteUser(params: {
  user: Pick<
    User,
    | "id"
    | "email"
    | "hwidDeviceLimit"
    | "telegramId"
    | "vpnProvisionState"
    | "remnawaveUserUuid"
    | "subscriptionUrl"
  >;
  squadRemoteUuid?: string | null;
  hwidDeviceLimit?: number | null;
  expireAt: Date;
}) {
  if (!isConfigured()) {
    return null;
  }

  if (params.user.remnawaveUserUuid) {
    const body = {
      uuid: params.user.remnawaveUserUuid,
      email: params.user.email,
      telegramId: params.user.telegramId ? Number(params.user.telegramId) : null,
      hwidDeviceLimit: params.hwidDeviceLimit ?? params.user.hwidDeviceLimit ?? undefined,
      activeInternalSquads: params.squadRemoteUuid ? [params.squadRemoteUuid] : undefined,
      expireAt: params.expireAt.toISOString(),
      status: "ACTIVE" as const,
    };
    UpdateUserCommand.RequestSchema.parse(body);
    const result = await remnawaveRequest<UpdateUserCommand.Response>({
      path: UpdateUserCommand.url,
      method: "PATCH",
      body,
    });
    return UpdateUserCommand.ResponseSchema.parse(result).response;
  }

  const body = {
    username: buildRemoteUsername(params.user),
    email: params.user.email,
    telegramId: params.user.telegramId ? Number(params.user.telegramId) : null,
    hwidDeviceLimit: params.hwidDeviceLimit ?? params.user.hwidDeviceLimit ?? undefined,
    activeInternalSquads: params.squadRemoteUuid ? [params.squadRemoteUuid] : undefined,
    expireAt: params.expireAt.toISOString(),
    status: "ACTIVE" as const,
  };
  CreateUserCommand.RequestSchema.parse(body);
  const result = await remnawaveRequest<CreateUserCommand.Response>({
    path: CreateUserCommand.url,
    method: "POST",
    body,
  });

  return CreateUserCommand.ResponseSchema.parse(result).response;
}

export async function enableRemoteUser(remnawaveUserUuid?: string | null) {
  if (!isConfigured() || !remnawaveUserUuid) {
    return null;
  }

  const result = await remnawaveRequest<EnableUserCommand.Response>({
    path: EnableUserCommand.url(remnawaveUserUuid),
    method: "POST",
    body: { uuid: remnawaveUserUuid },
  });

  return EnableUserCommand.ResponseSchema.parse(result).response;
}

export async function disableRemoteUser(remnawaveUserUuid?: string | null) {
  if (!isConfigured() || !remnawaveUserUuid) {
    return null;
  }

  const result = await remnawaveRequest<DisableUserCommand.Response>({
    path: DisableUserCommand.url(remnawaveUserUuid),
    method: "POST",
    body: { uuid: remnawaveUserUuid },
  });

  return DisableUserCommand.ResponseSchema.parse(result).response;
}

export async function deleteRemoteUser(remnawaveUserUuid?: string | null) {
  if (!isConfigured() || !remnawaveUserUuid) {
    return null;
  }

  const result = await remnawaveRequest<DeleteUserCommand.Response>({
    path: DeleteUserCommand.url(remnawaveUserUuid),
    method: "DELETE",
    body: { uuid: remnawaveUserUuid },
  });

  return DeleteUserCommand.ResponseSchema.parse(result).response;
}

export async function getRemoteUserDevices(
  remnawaveUserUuid?: string | null,
  signal?: AbortSignal,
) {
  if (!isConfigured() || !remnawaveUserUuid) {
    return [];
  }

  GetUserHwidDevicesCommand.RequestSchema.parse({ userUuid: remnawaveUserUuid });
  const result = await remnawaveRequest<GetUserHwidDevicesCommand.Response>({
    path: GetUserHwidDevicesCommand.url(remnawaveUserUuid),
    method: "GET",
    signal,
  });

  return GetUserHwidDevicesCommand.ResponseSchema.parse(result).response.devices;
}

export async function deleteRemoteUserDevice(params: {
  remnawaveUserUuid?: string | null;
  hwid: string;
}) {
  if (!isConfigured() || !params.remnawaveUserUuid) {
    return [];
  }

  const body = {
    userUuid: params.remnawaveUserUuid,
    hwid: params.hwid,
  };

  DeleteUserHwidDeviceCommand.RequestSchema.parse(body);
  const result = await remnawaveRequest<DeleteUserHwidDeviceCommand.Response>({
    path: DeleteUserHwidDeviceCommand.url,
    method: "POST",
    body,
  });

  return DeleteUserHwidDeviceCommand.ResponseSchema.parse(result).response.devices;
}

export async function createRemoteConfigProfile(params: {
  name: string;
  config: Record<string, unknown>;
}) {
  if (!isConfigured()) {
    throw new Error("Remnawave is not configured.");
  }

  const body = {
    name: params.name,
    config: params.config,
  };
  CreateConfigProfileCommand.RequestSchema.parse(body);
  const result = await remnawaveRequest<CreateConfigProfileCommand.Response>({
    path: CreateConfigProfileCommand.url,
    method: "POST",
    body,
  });

  return CreateConfigProfileCommand.ResponseSchema.parse(result).response;
}

export async function createRemoteNode(params: {
  name: string;
  address: string;
  port: number;
  countryCode: string;
  activeConfigProfileUuid: string;
  activeInbounds: string[];
}) {
  if (!isConfigured()) {
    throw new Error("Remnawave is not configured.");
  }

  const body = {
    name: params.name,
    address: params.address,
    port: params.port,
    countryCode: params.countryCode,
    isTrafficTrackingActive: true,
    configProfile: {
      activeConfigProfileUuid: params.activeConfigProfileUuid,
      activeInbounds: params.activeInbounds,
    },
    tags: ["auto-provisioned"],
  };
  CreateNodeCommand.RequestSchema.parse(body);
  const result = await remnawaveRequest<CreateNodeCommand.Response>({
    path: CreateNodeCommand.url,
    method: "POST",
    body,
  });

  return CreateNodeCommand.ResponseSchema.parse(result).response;
}

export async function createRemoteHost(params: {
  remark: string;
  address: string;
  port: number;
  configProfileUuid: string;
  configProfileInboundUuid: string;
  nodeUuid: string;
  internalSquadUuid?: string | null;
}) {
  if (!isConfigured()) {
    throw new Error("Remnawave is not configured.");
  }

  const body = {
    remark: params.remark,
    address: params.address,
    port: params.port,
    sni: params.address,
    alpn: "h3" as const,
    securityLayer: "TLS" as const,
    tag: "ROUTING_HOST",
    inbound: {
      configProfileUuid: params.configProfileUuid,
      configProfileInboundUuid: params.configProfileInboundUuid,
    },
    nodes: [params.nodeUuid],
    excludedInternalSquads: params.internalSquadUuid ? [] : undefined,
  };
  CreateHostCommand.RequestSchema.parse(body);
  const result = await remnawaveRequest<CreateHostCommand.Response>({
    path: CreateHostCommand.url,
    method: "POST",
    body,
  });

  return CreateHostCommand.ResponseSchema.parse(result).response;
}
