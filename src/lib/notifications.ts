import { NotificationType, type User } from "@prisma/client";
import { db } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";

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
