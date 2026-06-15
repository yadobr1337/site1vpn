import "server-only";

import crypto from "node:crypto";
import { db } from "@/lib/db";

const TELEGRAM_LINK_PREFIX = "telegram-link:";
const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueTelegramLinkToken(userId: string) {
  const identifier = `${TELEGRAM_LINK_PREFIX}${userId}`;
  const token = crypto.randomBytes(24).toString("base64url");

  await db.$transaction([
    db.verificationToken.deleteMany({
      where: { identifier },
    }),
    db.verificationToken.create({
      data: {
        identifier,
        token: hashToken(token),
        expires: new Date(Date.now() + TELEGRAM_LINK_TTL_MS),
      },
    }),
  ]);

  return token;
}

export async function consumeTelegramLinkToken(token: string) {
  const stored = await db.verificationToken.findUnique({
    where: { token: hashToken(token) },
  });

  if (
    !stored ||
    !stored.identifier.startsWith(TELEGRAM_LINK_PREFIX) ||
    stored.expires <= new Date()
  ) {
    if (stored) {
      await db.verificationToken.delete({ where: { token: stored.token } });
    }
    return null;
  }

  return {
    storedToken: stored.token,
    userId: stored.identifier.slice(TELEGRAM_LINK_PREFIX.length),
  };
}
