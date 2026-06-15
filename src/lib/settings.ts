import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  DEFAULT_HWID_DEVICE_LIMIT,
  SUBSCRIPTION_DELETION_GRACE_HOURS,
} from "@/lib/site";

const SETTINGS_DEFAULTS_VERSION = 1;

export async function getSettings(tx: Prisma.TransactionClient | typeof db = db) {
  const settings = await tx.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      deletionGraceHours: SUBSCRIPTION_DELETION_GRACE_HOURS,
      defaultHwidDeviceLimit: DEFAULT_HWID_DEVICE_LIMIT,
      defaultsVersion: SETTINGS_DEFAULTS_VERSION,
    },
  });

  if (
    settings.deletionGraceHours === SUBSCRIPTION_DELETION_GRACE_HOURS &&
    settings.defaultsVersion >= SETTINGS_DEFAULTS_VERSION
  ) {
    return settings;
  }

  return tx.systemSettings.update({
    where: { id: "default" },
    data: {
      deletionGraceHours: SUBSCRIPTION_DELETION_GRACE_HOURS,
      ...(settings.defaultsVersion < SETTINGS_DEFAULTS_VERSION
          ? {
            defaultHwidDeviceLimit: DEFAULT_HWID_DEVICE_LIMIT,
            defaultsVersion: SETTINGS_DEFAULTS_VERSION,
          }
        : {}),
    },
  });
}
