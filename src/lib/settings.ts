import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function getSettings(tx: Prisma.TransactionClient | typeof db = db) {
  return tx.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
    },
  });
}
