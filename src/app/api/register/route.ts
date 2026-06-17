import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCaptchaToken } from "@/lib/captcha";
import { db } from "@/lib/db";
import {
  buildEmailVerificationIdentifier,
  issueEmailCode,
} from "@/lib/email-codes";
import { hashPassword } from "@/lib/passwords";
import { getSettings } from "@/lib/settings";
import { DEFAULT_HWID_DEVICE_LIMIT } from "@/lib/site";
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

  if (settings.maintenanceEnabled) {
    return NextResponse.json(
      { error: "Регистрация временно недоступна из-за технических работ." },
      { status: 503 },
    );
  }

  if (settings.captchaEnabled) {
    const captchaOk = await verifyCaptchaToken(payload.captchaToken);
    if (!captchaOk) {
      return NextResponse.json(
        { error: "Пройдите CAPTCHA перед регистрацией." },
        { status: 400 },
      );
    }
  }

  const existing = await db.user.findUnique({
    where: { email: payload.email.toLowerCase() },
  });

  if (existing) {
    return NextResponse.json({ error: "Email is already registered." }, { status: 409 });
  }

  const passwordHash = await hashPassword(payload.password);

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: payload.email.toLowerCase(),
        passwordHash,
        role: Role.USER,
        hwidDeviceLimit: DEFAULT_HWID_DEVICE_LIMIT,
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
