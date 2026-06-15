import {
  NotificationType,
  Prisma,
  TransactionType,
  type Squad,
  type User,
} from "@prisma/client";
import { db } from "@/lib/db";
import { notifyUserOnce } from "@/lib/notifications";
import {
  deleteRemoteUser,
  disableRemoteUser,
  enableRemoteUser,
  provisionRemoteUser,
} from "@/lib/remnawave";
import { getSettings } from "@/lib/settings";
import { MS_IN_DAY } from "@/lib/site";
import { ensureUserSquad } from "@/lib/squads";

type ManagedUser = User & {
  squad: Squad | null;
};

function normalizeDeviceCount(deviceCount: number) {
  return Math.max(1, deviceCount);
}

function computeRemainingDays(
  balanceKopeks: number,
  pricePerDayKopeks: number,
  deviceCount: number,
) {
  if (pricePerDayKopeks <= 0) {
    return 0;
  }

  return balanceKopeks / (pricePerDayKopeks * normalizeDeviceCount(deviceCount));
}

function computeRemainingMs(
  balanceKopeks: number,
  pricePerDayKopeks: number,
  deviceCount: number,
) {
  if (balanceKopeks <= 0 || pricePerDayKopeks <= 0) {
    return 0;
  }

  return Number(
    (BigInt(balanceKopeks) * BigInt(MS_IN_DAY)) /
      (BigInt(pricePerDayKopeks) * BigInt(normalizeDeviceCount(deviceCount))),
  );
}

function resolveHwidDeviceLimit(user: Pick<User, "hwidDeviceLimit">, defaultLimit: number) {
  return normalizeDeviceCount(user.hwidDeviceLimit ?? defaultLimit);
}

function computeSubscriptionExpireAt(
  user: Pick<User, "balanceKopeks" | "lastBillingAt" | "hwidDeviceLimit">,
  settings: { pricePerDayKopeks: number; defaultHwidDeviceLimit: number },
  now = new Date(),
) {
  const deviceCount = resolveHwidDeviceLimit(user, settings.defaultHwidDeviceLimit);
  const remainingMs = computeRemainingMs(user.balanceKopeks, settings.pricePerDayKopeks, deviceCount);
  const anchor = user.lastBillingAt ?? now;

  return new Date(anchor.getTime() + remainingMs);
}

async function fetchManagedUser(userId: string, tx: Prisma.TransactionClient = db) {
  return tx.user.findUnique({
    where: { id: userId },
    include: { squad: true },
  });
}

export async function settleUserBilling(
  userId: string,
  tx: Prisma.TransactionClient = db,
  now = new Date(),
) {
  const settings = await getSettings(tx);
  const existing = await fetchManagedUser(userId, tx);

  if (!existing) {
    throw new Error("User not found.");
  }

  const user = existing;

  if (user.balanceKopeks <= 0) {
    if (!user.billingStartedAt && user.billingCycle === 0) {
      return user;
    }

    if (!user.subscriptionEndedAt) {
      return tx.user.update({
        where: { id: user.id },
        data: {
          balanceKopeks: 0,
          subscriptionEndedAt: now,
          removalScheduledAt: new Date(now.getTime() + settings.deletionGraceHours * 3_600_000),
          vpnProvisionState:
            user.vpnProvisionState === "DELETED" ? user.vpnProvisionState : "DISABLED",
        },
        include: { squad: true },
      });
    }

    return user;
  }

  if (user.isBanned) {
    return user;
  }

  const billingAnchor = user.lastBillingAt ?? user.billingStartedAt ?? now;
  const elapsedMs = Math.max(0, now.getTime() - billingAnchor.getTime());
  const deviceCount = resolveHwidDeviceLimit(user, settings.defaultHwidDeviceLimit);

  if (elapsedMs === 0) {
    return user;
  }

  const chargeMicros =
    user.billingCarryMicros +
    (BigInt(elapsedMs) *
      BigInt(settings.pricePerDayKopeks) *
      BigInt(deviceCount) *
      1_000_000n) /
      BigInt(MS_IN_DAY);
  const debitKopeks = Number(chargeMicros / 1_000_000n);
  const carryMicros = chargeMicros % 1_000_000n;

  if (debitKopeks <= 0) {
    return tx.user.update({
      where: { id: user.id },
      data: {
        lastBillingAt: now,
        billingCarryMicros: carryMicros,
      },
      include: { squad: true },
    });
  }

  if (debitKopeks >= user.balanceKopeks) {
    const lifetimeMicros = BigInt(user.balanceKopeks) * 1_000_000n + user.billingCarryMicros;
    const msUntilDepleted = Number(
      (lifetimeMicros * BigInt(MS_IN_DAY)) /
        (BigInt(settings.pricePerDayKopeks) * BigInt(deviceCount) * 1_000_000n),
    );
    const endedAt = new Date(billingAnchor.getTime() + msUntilDepleted);

    return tx.user.update({
      where: { id: user.id },
      data: {
        balanceKopeks: 0,
        billingCarryMicros: 0,
        lastBillingAt: endedAt,
        subscriptionEndedAt: endedAt,
        removalScheduledAt: new Date(endedAt.getTime() + settings.deletionGraceHours * 3_600_000),
        vpnProvisionState: user.vpnProvisionState === "DELETED" ? "DELETED" : "DISABLED",
        transactions: {
          create: {
            type: TransactionType.BILLING_DEBIT,
            amountKopeks: -user.balanceKopeks,
            description: "Automatic daily billing",
          },
        },
      },
      include: { squad: true },
    });
  }

  return tx.user.update({
    where: { id: user.id },
    data: {
      balanceKopeks: {
        decrement: debitKopeks,
      },
      billingCarryMicros: carryMicros,
      lastBillingAt: now,
      transactions: {
        create: {
          type: TransactionType.BILLING_DEBIT,
          amountKopeks: -debitKopeks,
          description: "Automatic daily billing",
        },
      },
    },
    include: { squad: true },
  });
}

async function activateSubscription(params: {
  tx: Prisma.TransactionClient;
  user: ManagedUser;
  amountKopeks: number;
  type: TransactionType;
  description: string;
  markTrial?: boolean;
}) {
  const now = new Date();
  const isReactivation = params.user.balanceKopeks <= 0;

  return params.tx.user.update({
    where: { id: params.user.id },
    data: {
      balanceKopeks: {
        increment: params.amountKopeks,
      },
      billingCarryMicros: isReactivation ? 0 : params.user.billingCarryMicros,
      billingStartedAt: isReactivation ? now : params.user.billingStartedAt ?? now,
      lastBillingAt: isReactivation ? now : params.user.lastBillingAt ?? now,
      billingCycle: isReactivation ? { increment: 1 } : undefined,
      subscriptionEndedAt: null,
      removalScheduledAt: null,
      trialClaimedAt: params.markTrial ? now : undefined,
      transactions: {
        create: {
          type: params.type,
          amountKopeks: params.amountKopeks,
          description: params.description,
        },
      },
    },
    include: { squad: true },
  });
}

export async function topUpBalance(params: {
  userId: string;
  amountKopeks: number;
  description: string;
  type?: TransactionType;
}) {
  if (params.amountKopeks <= 0) {
    throw new Error("Top-up amount must be positive.");
  }

  const user = await db.$transaction(
    async (tx) => {
      const settled = await settleUserBilling(params.userId, tx);
      return activateSubscription({
        tx,
        user: settled,
        amountKopeks: params.amountKopeks,
        type: params.type ?? TransactionType.TOPUP,
        description: params.description,
      });
    },
    { timeout: 15_000, maxWait: 10_000 },
  );

  await syncUserLifecycle(user.id);

  await notifyUserOnce({
    user,
    type: NotificationType.TOPUP,
    cycleKey: `${user.billingCycle}:${user.updatedAt.toISOString()}`,
    message: `<b>1VPN</b>\nБаланс пополнен на <b>${(params.amountKopeks / 100).toFixed(2)} RUB</b>.`,
  });

  return user;
}

export async function claimTrialDay(userId: string) {
  const user = await db.$transaction(
    async (tx) => {
      const settings = await getSettings(tx);
      const settled = await settleUserBilling(userId, tx);
      const trialAmount =
        settings.pricePerDayKopeks *
        settings.trialDays *
        resolveHwidDeviceLimit(settled, settings.defaultHwidDeviceLimit);

      if (settled.trialClaimedAt) {
        throw new Error("Trial has already been claimed.");
      }

      return activateSubscription({
        tx,
        user: settled,
        amountKopeks: trialAmount,
        type: TransactionType.TRIAL,
        description: "One-time free trial",
        markTrial: true,
      });
    },
    { timeout: 15_000, maxWait: 10_000 },
  );

  await syncUserLifecycle(user.id);
  return user;
}

export async function adjustBalanceByAdmin(params: {
  userId: string;
  amountKopeks: number;
  description: string;
}) {
  if (params.amountKopeks === 0) {
    throw new Error("Adjustment amount must not be zero.");
  }

  const user = await db.$transaction(
    async (tx) => {
      const settings = await getSettings(tx);
      const settled = await settleUserBilling(params.userId, tx);

      if (params.amountKopeks > 0) {
        return activateSubscription({
          tx,
          user: settled,
          amountKopeks: params.amountKopeks,
          type: TransactionType.ADMIN_ADJUSTMENT,
          description: params.description,
        });
      }

      const nextBalance = Math.max(0, settled.balanceKopeks + params.amountKopeks);
      return tx.user.update({
        where: { id: settled.id },
        data: {
          balanceKopeks: nextBalance,
          lastBillingAt: new Date(),
          subscriptionEndedAt: nextBalance === 0 ? new Date() : null,
          removalScheduledAt:
            nextBalance === 0
              ? new Date(Date.now() + settings.deletionGraceHours * 3_600_000)
              : null,
          transactions: {
            create: {
              type: TransactionType.ADMIN_ADJUSTMENT,
              amountKopeks: params.amountKopeks,
              description: params.description,
            },
          },
        },
        include: { squad: true },
      });
    },
    { timeout: 15_000, maxWait: 10_000 },
  );

  await syncUserLifecycle(user.id);

  if (params.amountKopeks > 0) {
    await notifyUserOnce({
      user,
      type: NotificationType.TOPUP,
      cycleKey: `${user.billingCycle}:admin:${user.updatedAt.toISOString()}`,
      message: `<b>1VPN</b>\nАдминистратор пополнил баланс на <b>${(params.amountKopeks / 100).toFixed(2)} RUB</b>.`,
    });
  }

  return user;
}

export async function setBanState(userId: string, isBanned: boolean) {
  const user = await db.$transaction(
    async (tx) => {
      const settled = await settleUserBilling(userId, tx);
      const now = new Date();

      return tx.user.update({
        where: { id: settled.id },
        data: {
          isBanned,
          bannedAt: isBanned ? now : null,
          lastBillingAt:
            !isBanned && settled.balanceKopeks > 0 ? now : settled.lastBillingAt ?? now,
        },
        include: { squad: true },
      });
    },
    { timeout: 15_000, maxWait: 10_000 },
  );

  await syncUserLifecycle(user.id);

  await notifyUserOnce({
    user,
    type: isBanned ? NotificationType.BANNED : NotificationType.UNBANNED,
    cycleKey: `${user.billingCycle}:${isBanned ? "banned" : "unbanned"}:${user.updatedAt.toISOString()}`,
    message: isBanned
      ? "<b>1VPN</b>\nДоступ временно приостановлен администратором."
      : "<b>1VPN</b>\nДоступ восстановлен. Подписка снова активна.",
  });

  return user;
}

export async function syncUserLifecycle(userId: string) {
  const settings = await getSettings();
  const settled = await db.$transaction((tx) => settleUserBilling(userId, tx), {
    timeout: 15_000,
    maxWait: 10_000,
  });

  if (!settled.squad) {
    await ensureUserSquad(settled.id);
  }

  const managed = await db.user.findUnique({
    where: { id: settled.id },
    include: { squad: true },
  });

  if (!managed) {
    return null;
  }

  try {
    if (managed.isBanned) {
      await disableRemoteUser(managed.remnawaveUserUuid);
      return db.user.update({
        where: { id: managed.id },
        data: {
          vpnProvisionState: managed.remnawaveUserUuid ? "DISABLED" : "PENDING",
          vpnStatusMessage: "Paused by admin ban",
        },
        include: { squad: true },
      });
    }

    if (managed.balanceKopeks > 0) {
      if (!managed.squad?.remnawaveInternalSquadUuid) {
        return db.user.update({
          where: { id: managed.id },
          data: {
            vpnProvisionState: "PENDING",
            vpnStatusMessage: managed.squad
              ? "Укажите UUID сквада Remnawave в админке"
              : "Ожидает назначения в свободный сквад",
          },
          include: { squad: true },
        });
      }

      const remoteUser = await provisionRemoteUser({
        user: managed,
        squadRemoteUuid: managed.squad.remnawaveInternalSquadUuid,
        hwidDeviceLimit: resolveHwidDeviceLimit(managed, settings.defaultHwidDeviceLimit),
        expireAt: computeSubscriptionExpireAt(managed, settings),
      });

      if (managed.remnawaveUserUuid) {
        await enableRemoteUser(managed.remnawaveUserUuid);
      }

      const updated = await db.user.update({
        where: { id: managed.id },
        data: remoteUser
          ? {
              remnawaveUserUuid: remoteUser.uuid,
              remnawaveShortUuid: remoteUser.shortUuid,
              subscriptionUrl: remoteUser.subscriptionUrl,
              vpnProvisionState: "ACTIVE",
              vpnStatusMessage: "Provisioned and active",
            }
          : {
              vpnStatusMessage: "Running locally. Remnawave integration is not configured.",
            },
        include: { squad: true },
      });

      const remainingDays = computeRemainingDays(
        updated.balanceKopeks,
        settings.pricePerDayKopeks,
        resolveHwidDeviceLimit(updated, settings.defaultHwidDeviceLimit),
      );

      if (remainingDays <= 1) {
        await notifyUserOnce({
          user: updated,
          type: NotificationType.EXPIRING_SOON,
          cycleKey: `${updated.billingCycle}:soon`,
          message: `<b>1VPN</b>\nПодписка закончится меньше чем через сутки. Остаток: <b>${Math.max(0, Math.ceil(remainingDays))} дн.</b>`,
        });
      }

      return updated;
    }

    if (managed.subscriptionEndedAt) {
      await disableRemoteUser(managed.remnawaveUserUuid);
      await notifyUserOnce({
        user: managed,
        type: NotificationType.EXPIRED,
        cycleKey: `${managed.billingCycle}:expired`,
        message: `<b>1VPN</b>\nПодписка закончилась. Доступ отключен до пополнения баланса.`,
      });
      await notifyUserOnce({
        user: managed,
        type: NotificationType.DELETION_WARNING,
        cycleKey: `${managed.billingCycle}:warning`,
        message: `<b>1VPN</b>\nЕсли баланс не пополнить, ссылка будет удалена через <b>${settings.deletionGraceHours} часов</b>.`,
      });
    }

    if (managed.removalScheduledAt && managed.removalScheduledAt <= new Date()) {
      await deleteRemoteUser(managed.remnawaveUserUuid);
      return db.user.update({
        where: { id: managed.id },
        data: {
          remnawaveUserUuid: null,
          remnawaveShortUuid: null,
          subscriptionUrl: null,
          vpnProvisionState: "DELETED",
          vpnStatusMessage: "Subscription link deleted after grace period",
        },
        include: { squad: true },
      });
    }

    return db.user.update({
      where: { id: managed.id },
      data: {
        vpnProvisionState: managed.remnawaveUserUuid ? "DISABLED" : "PENDING",
        vpnStatusMessage: managed.subscriptionEndedAt
          ? "Waiting for balance top-up"
          : "Awaiting initial funding",
      },
      include: { squad: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Remnawave error";

    return db.user.update({
      where: { id: managed.id },
      data: {
        vpnProvisionState: "ERROR",
        vpnStatusMessage: message.slice(0, 300),
      },
      include: { squad: true },
    });
  }
}

export async function runLifecycleSweep() {
  const users = await db.user.findMany({
    select: { id: true },
  });

  for (const user of users) {
    try {
      await syncUserLifecycle(user.id);
    } catch (error) {
      console.error(`[lifecycle] failed to sync user ${user.id}`, error);
    }
  }
}

export async function getUserOverview(userId: string) {
  const settings = await getSettings();
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { squad: true },
  });

  if (!user) {
    return null;
  }

  return {
    user,
    settings,
    remainingDays: computeRemainingDays(
      user.balanceKopeks,
      settings.pricePerDayKopeks,
      resolveHwidDeviceLimit(user, settings.defaultHwidDeviceLimit),
    ),
    effectiveHwidDeviceLimit: resolveHwidDeviceLimit(user, settings.defaultHwidDeviceLimit),
  };
}
