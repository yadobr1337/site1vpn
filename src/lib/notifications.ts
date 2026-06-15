import { NotificationType, type User } from "@prisma/client";
import { db } from "@/lib/db";
import {
  escapeTelegramHtml,
  sendTelegramMessage,
  sendTelegramPhoto,
} from "@/lib/telegram";

export async function notifyUserOnce(params: {
  user: Pick<User, "id" | "telegramId" | "email">;
  type: NotificationType;
  cycleKey: string;
  message: string;
}) {
  const existing = await db.notificationEvent.findUnique({
    where: {
      userId_type_cycleKey: {
        userId: params.user.id,
        type: params.type,
        cycleKey: params.cycleKey,
      },
    },
  });

  if (existing?.success) {
    return existing;
  }

  let success = false;
  let message = "Telegram ID is not linked.";

  if (params.user.telegramId) {
    const result = await sendTelegramMessage(params.user.telegramId, params.message);
    success = result.ok;
    message = result.ok ? "Delivered to Telegram." : result.error;
  }

  if (existing) {
    return db.notificationEvent.update({
      where: { id: existing.id },
      data: {
        success,
        message,
      },
    });
  }

  return db.notificationEvent.create({
    data: {
      userId: params.user.id,
      type: params.type,
      cycleKey: params.cycleKey,
      success,
      message,
    },
  });
}

export async function broadcastTelegramMessage(params: {
  text: string;
  photo?: File | null;
}) {
  const users = await db.user.findMany({
    where: {
      telegramBotConfirmedAt: {
        not: null,
      },
      telegramId: {
        not: null,
      },
    },
    select: {
      telegramId: true,
    },
  });

  const message = `📣 <b>Объявление</b>\n\n${escapeTelegramHtml(params.text)}`;
  let delivered = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.telegramId) continue;

    const result = params.photo
      ? await sendTelegramPhoto(user.telegramId, message, params.photo)
      : await sendTelegramMessage(user.telegramId, message);

    if (result.ok) {
      delivered += 1;
    } else {
      failed += 1;
    }
  }

  return {
    recipients: users.length,
    delivered,
    failed,
  };
}
