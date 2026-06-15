import { db } from "@/lib/db";

function randomNumericId(length = 8) {
  let value = "";

  for (let index = 0; index < length; index += 1) {
    const digit = index === 0 ? 1 + Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10);
    value += String(digit);
  }

  return value;
}

export async function generateUniquePublicId() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const publicId = randomNumericId();
    const existing = await db.user.findUnique({
      where: { publicId },
      select: { id: true },
    });

    if (!existing) {
      return publicId;
    }
  }

  throw new Error("Failed to generate a unique public ID.");
}

export async function ensureUserPublicId(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, publicId: true },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  if (user.publicId) {
    return user.publicId;
  }

  const publicId = await generateUniquePublicId();
  await db.user.update({
    where: { id: user.id },
    data: { publicId },
  });

  return publicId;
}

export async function ensureAllUsersHavePublicIds() {
  const users = await db.user.findMany({
    where: { publicId: null },
    select: { id: true },
  });

  for (const user of users) {
    await ensureUserPublicId(user.id);
  }
}

export async function resolveUserIdentifier(rawIdentifier: string) {
  const identifier = rawIdentifier.trim();
  if (!identifier) {
    throw new Error("User identifier is required.");
  }

  const user = await db.user.findFirst({
    where: {
      OR: [{ id: identifier }, { publicId: identifier }, { email: identifier.toLowerCase() }],
    },
    select: { id: true },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  return user.id;
}
