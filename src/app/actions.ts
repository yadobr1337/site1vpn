"use server";

import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireAdmin, requireUser } from "@/lib/auth";
import {
  adjustBalanceByAdmin,
  claimTrialDay,
  grantDaysToAllUsers,
  runLifecycleSweep,
  setBanState,
  syncUserLifecycle,
  topUpBalance,
} from "@/lib/billing";
import {
  buildEmailVerificationIdentifier,
  consumeEmailCode,
  issueEmailCode,
} from "@/lib/email-codes";
import { broadcastTelegramMessage } from "@/lib/notifications";
import {
  checkRemnawaveConnection,
  deleteRemoteUserDevice,
  getRemoteInternalSquad,
  type RemnawaveConnectionStatus,
} from "@/lib/remnawave";
import { createSquad, deleteSquad, updateSquad } from "@/lib/squads";
import { resolveUserIdentifier } from "@/lib/user-identity";
import { SUBSCRIPTION_DELETION_GRACE_HOURS } from "@/lib/site";

function parseKopeks(value: FormDataEntryValue | null) {
  const amount = Number(String(value ?? "0").replace(",", "."));
  if (!Number.isFinite(amount)) {
    throw new Error("Invalid amount.");
  }
  return Math.round(amount * 100);
}

function parseOptionalInteger(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Invalid integer value.");
  }

  return parsed;
}

function parseRequiredPositiveInteger(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Invalid integer value.");
  }
  return parsed;
}

function parseRequiredString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  if (!parsed) {
    throw new Error("Value is required.");
  }
  return parsed;
}

function parseOptionalString(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function redirectByMailError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("SMTP is not configured")) {
    redirect("/dashboard/account?emailStatus=smtp_missing");
  }

  if (
    message.includes("Invalid login") ||
    message.includes("535") ||
    message.includes("Username and Password not accepted") ||
    message.toLowerCase().includes("auth")
  ) {
    redirect("/dashboard/account?emailStatus=smtp_auth_error");
  }

  redirect("/dashboard/account?emailStatus=send_error");
}

export async function topUpBalanceAction(formData: FormData) {
  const session = await requireUser();

  if (env.PAYMENTS_AUTO_APPROVE !== "true") {
    throw new Error("Automatic top-up is disabled until a payment provider is connected.");
  }

  await topUpBalance({
    userId: session.user.id,
    amountKopeks: parseKopeks(formData.get("amount")),
    description: "Instant checkout top-up",
  });

  revalidatePath("/dashboard");
  revalidatePath("/admin");
}

export async function claimTrialAction() {
  const session = await requireUser();

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { telegramBotConfirmedAt: true },
  });

  if (!user?.telegramBotConfirmedAt) {
    throw new Error("Сначала подтвердите Telegram, запустив бота.");
  }

  await claimTrialDay(session.user.id);
  revalidatePath("/dashboard");
  revalidatePath("/admin");
}

export async function updateSettingsAction(formData: FormData) {
  await requireAdmin();

  await db.systemSettings.update({
    where: { id: "default" },
    data: {
      pricePerDayKopeks: parseKopeks(formData.get("pricePerDay")),
      trialDays: parseRequiredPositiveInteger(formData.get("trialDays")),
      deletionGraceHours: SUBSCRIPTION_DELETION_GRACE_HOURS,
      defaultHwidDeviceLimit: parseRequiredPositiveInteger(formData.get("defaultHwidDeviceLimit")),
      captchaEnabled: String(formData.get("captchaEnabled")) === "on",
      supportTelegramUrl: String(formData.get("supportTelegramUrl") ?? "") || null,
      heroAnnouncement: String(formData.get("heroAnnouncement") ?? "") || null,
    },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export type SquadActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type SiteRestartActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type AdminBalanceActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type AdminOperationActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialSquadActionState: SquadActionState = {
  status: "idle",
  message: "",
};

function getActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 400) : "Неизвестная ошибка.";
}

export async function grantDaysToAllUsersAction(
  _previousState: AdminOperationActionState,
  formData: FormData,
): Promise<AdminOperationActionState> {
  await requireAdmin();
  void _previousState;

  try {
    const days = parseRequiredPositiveInteger(formData.get("days"));
    const description =
      parseOptionalString(formData.get("description")) ??
      `Подарок от 1VPN: ${days} дополнительных дней подписки.`;
    const result = await grantDaysToAllUsers({ days, description });

    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return {
      status: result.failed ? "error" : "success",
      message: `Начислено: ${result.granted} из ${result.total}. Ошибок: ${result.failed}.`,
    };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}

export async function updateMaintenanceAction(
  _previousState: AdminOperationActionState,
  formData: FormData,
): Promise<AdminOperationActionState> {
  await requireAdmin();
  void _previousState;

  try {
    const enabled = String(formData.get("enabled")) === "on";
    const message = parseOptionalString(formData.get("message"));

    await db.systemSettings.update({
      where: { id: "default" },
      data: {
        maintenanceEnabled: enabled,
        maintenanceMessage: message,
      },
    });

    revalidatePath("/", "layout");
    return {
      status: "success",
      message: enabled
        ? "Технический режим включён. Администраторы сохраняют доступ."
        : "Технический режим выключен. Сайт снова доступен пользователям.",
    };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}

export async function broadcastTelegramAction(
  _previousState: AdminOperationActionState,
  formData: FormData,
): Promise<AdminOperationActionState> {
  await requireAdmin();
  void _previousState;

  try {
    const text = parseRequiredString(formData.get("text"));
    if (text.length > 850) {
      throw new Error("Текст рассылки должен быть не длиннее 850 символов.");
    }

    const photoEntry = formData.get("photo");
    const photo =
      photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;

    if (photo && (!photo.type.startsWith("image/") || photo.size > 7 * 1024 * 1024)) {
      throw new Error("Загрузите изображение размером не более 7 МБ.");
    }

    const result = await broadcastTelegramMessage({ text, photo });
    return {
      status: result.failed ? "error" : "success",
      message: `Доставлено: ${result.delivered} из ${result.recipients}. Ошибок: ${result.failed}.`,
    };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}

export async function restartSiteAction(
  _previousState: SiteRestartActionState,
): Promise<SiteRestartActionState> {
  await requireAdmin();
  void _previousState;

  const restartRequestPath = "/var/www/site1vpn/runtime/restart.request";

  try {
    await mkdir(dirname(restartRequestPath), { recursive: true });
    await writeFile(restartRequestPath, new Date().toISOString(), "utf8");

    return {
      status: "success",
      message: "Запрос отправлен. Сайт перезапускается и снова откроется через несколько секунд.",
    };
  } catch (error) {
    return {
      status: "error",
      message: `Не удалось отправить запрос перезапуска: ${getActionErrorMessage(error)}`,
    };
  }
}

export async function createSquadAction(
  _previousState: SquadActionState = initialSquadActionState,
  formData: FormData,
): Promise<SquadActionState> {
  await requireAdmin();
  void _previousState;

  try {
    const remnawaveInternalSquadUuid = parseRequiredString(
      formData.get("remnawaveInternalSquadUuid"),
    );
    await getRemoteInternalSquad(remnawaveInternalSquadUuid);
    await createSquad({
      name: String(formData.get("name") ?? ""),
      memberLimit: parseRequiredPositiveInteger(formData.get("memberLimit")),
      remnawaveInternalSquadUuid,
    });
    await runLifecycleSweep();
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { status: "success", message: "Сквад добавлен, синхронизация запущена." };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}

export async function updateSquadLimitAction(
  _previousState: SquadActionState = initialSquadActionState,
  formData: FormData,
): Promise<SquadActionState> {
  await requireAdmin();
  void _previousState;

  try {
    const remnawaveInternalSquadUuid = parseRequiredString(
      formData.get("remnawaveInternalSquadUuid"),
    );
    await getRemoteInternalSquad(remnawaveInternalSquadUuid);
    await updateSquad({
      squadId: String(formData.get("squadId")),
      name: String(formData.get("name") ?? ""),
      memberLimit: parseRequiredPositiveInteger(formData.get("memberLimit")),
      isActive: String(formData.get("isActive")) === "on",
      remnawaveInternalSquadUuid,
    });
    await runLifecycleSweep();
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return { status: "success", message: "Сквад обновлён, пользователи синхронизированы." };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}

export async function deleteSquadAction(
  _previousState: SquadActionState = initialSquadActionState,
  formData: FormData,
): Promise<SquadActionState> {
  await requireAdmin();
  void _previousState;

  try {
    await deleteSquad(String(formData.get("squadId")));
    await runLifecycleSweep();
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    return {
      status: "success",
      message: "Сквад удалён. Пользователи отвязаны и перераспределены при наличии мест.",
    };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}

export async function toggleBanAction(formData: FormData) {
  await requireAdmin();
  await setBanState(
    await resolveUserIdentifier(String(formData.get("userId") ?? "")),
    String(formData.get("ban")) === "true",
  );
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function adjustUserBalanceAction(
  _previousState: AdminBalanceActionState,
  formData: FormData,
): Promise<AdminBalanceActionState> {
  await requireAdmin();
  void _previousState;

  try {
    const operation = String(formData.get("operation") ?? "");
    const amountKopeks = Math.abs(parseKopeks(formData.get("amount")));

    if (amountKopeks <= 0 || !["credit", "debit"].includes(operation)) {
      return { status: "error", message: "Укажите положительную сумму и выберите операцию." };
    }

    const isCredit = operation === "credit";
    await adjustBalanceByAdmin({
      userId: await resolveUserIdentifier(String(formData.get("userId") ?? "")),
      amountKopeks: isCredit ? amountKopeks : -amountKopeks,
      description:
        String(formData.get("description") ?? "").trim() ||
        (isCredit ? "Пополнение администратором" : "Списание администратором"),
    });
    revalidatePath("/admin");
    revalidatePath("/dashboard");

    return {
      status: "success",
      message: isCredit ? "Сумма добавлена к балансу." : "Сумма списана с баланса.",
    };
  } catch (error) {
    return { status: "error", message: getActionErrorMessage(error) };
  }
}

export async function updateUserHwidAction(formData: FormData) {
  await requireAdmin();
  const userId = await resolveUserIdentifier(String(formData.get("userId") ?? ""));

  await db.user.update({
    where: { id: userId },
    data: {
      hwidDeviceLimit: parseOptionalInteger(formData.get("hwidDeviceLimit")),
    },
  });

  await syncUserLifecycle(userId);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function updateOwnHwidAction(formData: FormData) {
  const session = await requireUser();

  await db.user.update({
    where: { id: session.user.id },
    data: {
      hwidDeviceLimit: parseRequiredPositiveInteger(formData.get("hwidDeviceLimit")),
    },
  });

  await syncUserLifecycle(session.user.id);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function updateOwnEmailAction(formData: FormData) {
  const session = await requireUser();
  const email = parseRequiredString(formData.get("email")).toLowerCase();

  const existing = await db.user.findFirst({
    where: {
      email,
      NOT: {
        id: session.user.id,
      },
    },
    select: { id: true },
  });

  if (existing) {
    redirect("/dashboard/account?emailStatus=email_exists");
  }

  await db.user.update({
    where: { id: session.user.id },
    data: {
      pendingEmail: email,
    },
  });

  try {
    await issueEmailCode({
      identifier: buildEmailVerificationIdentifier(session.user.id, email),
      email,
      subject: "1VPN: подтверждение email",
      title: "Подтвердите email",
      description:
        "Введите код на странице настроек аккаунта, чтобы привязать или изменить email для входа и уведомлений.",
    });
  } catch (error) {
    redirectByMailError(error);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/account");
  redirect("/dashboard/account?emailStatus=sent");
}

export async function verifyOwnEmailAction(formData: FormData) {
  const session = await requireUser();
  const code = parseRequiredString(formData.get("code"));

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      pendingEmail: true,
    },
  });

  if (!user?.pendingEmail) {
    redirect("/dashboard/account?emailStatus=no_pending_email");
  }

  const valid = await consumeEmailCode(
    buildEmailVerificationIdentifier(user.id, user.pendingEmail),
    code,
  );

  if (!valid) {
    redirect("/dashboard/account?emailStatus=invalid_code");
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      email: user.pendingEmail,
      pendingEmail: null,
      isEmailPlaceholder: false,
      emailVerified: new Date(),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/account");
  redirect("/dashboard/account?emailStatus=verified");
}

export async function resendOwnEmailVerificationAction() {
  const session = await requireUser();
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      pendingEmail: true,
      isEmailPlaceholder: true,
      emailVerified: true,
    },
  });

  if (!user) {
    redirect("/dashboard/account?emailStatus=user_not_found");
  }

  const targetEmail = user.pendingEmail ?? (!user.isEmailPlaceholder ? user.email : null);
  if (!targetEmail) {
    redirect("/dashboard/account?emailStatus=no_pending_email");
  }

  try {
    await issueEmailCode({
      identifier: buildEmailVerificationIdentifier(user.id, targetEmail),
      email: targetEmail,
      subject: "1VPN: код подтверждения email",
      title: "Подтверждение email",
      description:
        user.pendingEmail || !user.emailVerified
          ? "Подтвердите email кодом, чтобы использовать вход по почте и получать уведомления."
          : "Подтвердите действие кодом из письма.",
    });
  } catch (error) {
    redirectByMailError(error);
  }

  revalidatePath("/dashboard/account");
  redirect("/dashboard/account?emailStatus=resent");
}

export async function updateOwnPasswordAction(formData: FormData) {
  const session = await requireUser();
  const currentPassword = parseOptionalString(formData.get("currentPassword"));
  const newPassword = parseRequiredString(formData.get("newPassword"));

  if (newPassword.length < 8 || newPassword.length > 64) {
    throw new Error("Password must contain 8-64 characters.");
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  if (user.passwordHash) {
    if (!currentPassword) {
      throw new Error("Current password is required.");
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new Error("Current password is incorrect.");
    }
  }

  await db.user.update({
    where: { id: session.user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 12),
    },
  });

  revalidatePath("/dashboard/account");
}

export async function deleteOwnHwidDeviceAction(formData: FormData) {
  const session = await requireUser();
  const hwid = parseRequiredString(formData.get("hwid"));

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      remnawaveUserUuid: true,
    },
  });

  if (!user?.remnawaveUserUuid) {
    throw new Error("VPN profile is not provisioned yet.");
  }

  await deleteRemoteUserDevice({
    remnawaveUserUuid: user.remnawaveUserUuid,
    hwid,
  });

  revalidatePath("/dashboard");
}

export async function runSyncNowAction() {
  await requireAdmin();
  await runLifecycleSweep();
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function syncUserNowAction(formData: FormData) {
  await requireAdmin();
  const userId = await resolveUserIdentifier(String(formData.get("userId") ?? ""));
  await syncUserLifecycle(userId);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function refreshRemnawaveStatusAction(
  previousStatus: RemnawaveConnectionStatus,
): Promise<RemnawaveConnectionStatus> {
  void previousStatus;
  await requireAdmin();
  return checkRemnawaveConnection();
}
