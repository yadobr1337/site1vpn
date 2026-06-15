import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { publicEnv } from "@/lib/public-env";
import { issueTelegramLinkToken } from "@/lib/telegram-link";

export async function POST() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const botUsername = publicEnv.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!botUsername) {
    return NextResponse.json(
      { error: "Telegram bot username is not configured." },
      { status: 503 },
    );
  }

  const token = await issueTelegramLinkToken(session.user.id);
  return NextResponse.json({
    url: `https://t.me/${botUsername}?start=link_${token}`,
  });
}
