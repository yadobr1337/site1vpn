import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { buildPasswordResetIdentifier, issueEmailCode } from "@/lib/email-codes";

const schema = z.object({
  email: z.string().email(),
});

function mapMailError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("SMTP is not configured")) {
    return "SMTP не настроен.";
  }

  if (
    message.includes("Invalid login") ||
    message.includes("535") ||
    message.includes("Username and Password not accepted") ||
    message.toLowerCase().includes("auth")
  ) {
    return "SMTP отклонил авторизацию.";
  }

  return "Не удалось отправить письмо.";
}

export async function POST(request: Request) {
  const payload = schema.parse(await request.json());
  const email = payload.email.toLowerCase();

  const user = await db.user.findUnique({
    where: { email },
    select: {
      isEmailPlaceholder: true,
      emailVerified: true,
      passwordHash: true,
    },
  });

  if (!user || user.isEmailPlaceholder || !user.passwordHash) {
    return NextResponse.json({ error: "Аккаунт с таким email не найден." }, { status: 404 });
  }

  if (!user.emailVerified) {
    return NextResponse.json(
      { error: "Сначала подтвердите email в настройках аккаунта." },
      { status: 400 },
    );
  }

  try {
    await issueEmailCode({
      identifier: buildPasswordResetIdentifier(email),
      email,
      subject: "1VPN: код для сброса пароля",
      title: "Сброс пароля",
      description: "Введите этот код на странице входа и задайте новый пароль для аккаунта.",
    });
  } catch (error) {
    return NextResponse.json({ error: mapMailError(error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
