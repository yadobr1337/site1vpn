import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyTurnstileToken } from "@/lib/captcha";
import { db } from "@/lib/db";
import {
  buildEmailVerificationIdentifier,
  issueEmailCode,
} from "@/lib/email-codes";
import { getSettings } from "@/lib/settings";
import { ensureUserSquad } from "@/lib/squads";
import { ensureUserPublicId } from "@/lib/user-identity";

const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8).max(64),
    captchaToken: z.string().optional(),
  })
  .strict();

export async function POST(request: Request) {
  const payload = registerSchema.parse(await request.json());
  const settings = await getSettings();

  if (settings.captchaEnabled) {
    const captchaOk = await verifyTurnstileToken(payload.captchaToken);
    if (!captchaOk) {
      return NextResponse.json({ error: "CAPTCHA verification failed." }, { status: 400 });
    }
  }

  const existing = await db.user.findUnique({
    where: { email: payload.email.toLowerCase() },
  });

  if (existing) {
    return NextResponse.json({ error: "Email is already registered." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(payload.password, 12);

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: payload.email.toLowerCase(),
        passwordHash,
        role: Role.USER,
      },
    });

    await ensureUserSquad(created.id, tx);
    return created;
  });

  const publicId = await ensureUserPublicId(user.id);

  try {
    await issueEmailCode({
      identifier: buildEmailVerificationIdentifier(user.id, user.email),
      email: user.email,
      subject: "1VPN: код подтверждения email",
      title: "Подтвердите регистрацию",
      description:
        "Введите код в настройках аккаунта, чтобы подтвердить email и включить вход по одноразовым кодам.",
    });
  } catch {
    return NextResponse.json({ ok: true, userId: user.id, publicId, emailCodeSent: false });
  }

  return NextResponse.json({ ok: true, userId: user.id, publicId, emailCodeSent: true });
}
