import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthSession } from "@/lib/auth";
import { sendTelegramMessage, verifyTelegramAuth } from "@/lib/telegram";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = (await request.json()) as Record<string, string>;
  const verification = await verifyTelegramAuth({
    id: payload.id,
    first_name: payload.first_name,
    username: payload.username,
    photo_url: payload.photo_url,
    auth_date: payload.auth_date,
    hash: payload.hash,
  });

  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 400 });
  }

  const existing = await db.user.findFirst({
    where: {
      telegramId: verification.data.id,
      NOT: {
        id: session.user.id,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Этот Telegram уже привязан к другому аккаунту." },
      { status: 409 },
    );
  }

  await db.user.update({
    where: { id: session.user.id },
    data: {
      telegramId: verification.data.id,
      telegramFirstName: verification.data.firstName,
      telegramUsername: verification.data.username,
      telegramPhotoUrl: verification.data.photoUrl,
    },
  });

  await sendTelegramMessage(
    verification.data.id,
    "<b>1VPN</b>\nTelegram привязан. Уведомления о балансе и подписке включены.",
  );

  return NextResponse.json({ ok: true });
}
