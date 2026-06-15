import {
  CreateInternalSquadCommand,
  CreateUserCommand,
  DeleteUserCommand,
  DeleteUserHwidDeviceCommand,
  DisableUserCommand,
  EnableUserCommand,
  GetUserHwidDevicesCommand,
  UpdateUserCommand,
} from "@remnawave/backend-contract";
import type { Squad, User } from "@prisma/client";
import { env } from "@/lib/env";

function isConfigured() {
  return Boolean(env.REMNAWAVE_BASE_URL && env.REMNAWAVE_API_TOKEN);
}

async function remnawaveRequest<T>({
  path,
  method,
  body,
}: {
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
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
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
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

export async function getRemoteUserDevices(remnawaveUserUuid?: string | null) {
  if (!isConfigured() || !remnawaveUserUuid) {
    return [];
  }

  GetUserHwidDevicesCommand.RequestSchema.parse({ userUuid: remnawaveUserUuid });
  const result = await remnawaveRequest<GetUserHwidDevicesCommand.Response>({
    path: GetUserHwidDevicesCommand.url(remnawaveUserUuid),
    method: "GET",
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
