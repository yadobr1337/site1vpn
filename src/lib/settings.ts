import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { SUBSCRIPTION_DELETION_GRACE_HOURS } from "@/lib/site";

export async function getSettings(tx: Prisma.TransactionClient | typeof db = db) {
  const settings = await tx.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      deletionGraceHours: SUBSCRIPTION_DELETION_GRACE_HOURS,
    },
  });

  if (settings.deletionGraceHours === SUBSCRIPTION_DELETION_GRACE_HOURS) {
    return settings;
  }

  return tx.systemSettings.update({
    where: { id: "default" },
    data: { deletionGraceHours: SUBSCRIPTION_DELETION_GRACE_HOURS },
  });
}
