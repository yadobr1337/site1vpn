import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { buildPasswordResetIdentifier, consumeEmailCode } from "@/lib/email-codes";

const schema = z.object({
  email: z.string().email(),
  code: z.string().trim().min(4).max(12),
  password: z.string().min(8).max(64),
});

export async function POST(request: Request) {
  const payload = schema.parse(await request.json());
  const email = payload.email.toLowerCase();

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      isEmailPlaceholder: true,
    },
  });

  if (!user || user.isEmailPlaceholder) {
    return NextResponse.json({ error: "Аккаунт с таким email не найден." }, { status: 404 });
  }

  const isValid = await consumeEmailCode(buildPasswordResetIdentifier(email), payload.code);
  if (!isValid) {
    return NextResponse.json({ error: "Неверный или просроченный код." }, { status: 400 });
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(payload.password, 12),
    },
  });

  return NextResponse.json({ ok: true });
}
