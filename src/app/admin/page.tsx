import Link from "next/link";
import { Role, TransactionType, VpnProvisionState } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PendingButton } from "@/components/ui/pending-button";
import { RemnawaveStatusCard } from "@/components/admin/remnawave-status-card";
import { AdminOperations } from "@/components/admin/admin-operations";
import { SiteRestartCard } from "@/components/admin/site-restart-card";
import { SquadManager } from "@/components/admin/squad-manager";
import { UserManagerModal } from "@/components/admin/user-manager-modal";
import {
  runProvisioningNowAction,
  runSyncNowAction,
  updateSettingsAction,
} from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { checkRemnawaveConnection } from "@/lib/remnawave";
import { getProvisioningOverview } from "@/lib/provisioning";
import { ensureAllUsersHavePublicIds } from "@/lib/user-identity";
import { formatCurrency, formatDays } from "@/lib/utils";

function getVpnStatusLabel(params: {
  isBanned: boolean;
  balanceKopeks: number;
  vpnProvisionState: VpnProvisionState;
}) {
  if (params.isBanned) {
    return "Заблокирован";
  }

  if (params.balanceKopeks <= 0) {
    return "Ожидает оплаты";
  }

  if (params.vpnProvisionState === VpnProvisionState.ACTIVE) {
    return "Активный";
  }

  if (params.vpnProvisionState === VpnProvisionState.ERROR) {
    return "Ошибка панели";
  }

  return "Синхронизация";
}

function getTransactionLabel(type: TransactionType) {
  switch (type) {
    case TransactionType.TOPUP:
      return "Пополнение";
    case TransactionType.ADMIN_ADJUSTMENT:
      return "Ручное изменение";
    case TransactionType.TRIAL:
      return "Пробный день";
    case TransactionType.BILLING_DEBIT:
      return "Списание";
    default:
      return type;
  }
}

function getPeriodStart(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (days - 1));
  return date;
}

async function getAdminStats(periodStart: Date) {
  const [newUsers, buyers] = await Promise.all([
    db.user.count({
      where: {
        role: Role.USER,
        createdAt: {
          gte: periodStart,
        },
      },
    }),
    db.balanceTransaction.groupBy({
      by: ["userId"],
      where: {
        type: TransactionType.TOPUP,
        amountKopeks: {
          gt: 0,
        },
        createdAt: {
          gte: periodStart,
        },
        user: {
          role: Role.USER,
        },
      },
    }),
  ]);

  return {
    newUsers,
    buyers: buyers.length,
  };
}

type SearchParamsInput = Promise<{ user?: string | string[] }> | { user?: string | string[] } | undefined;

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  await requireAdmin();
  await ensureAllUsersHavePublicIds();

  const params = searchParams ? await searchParams : {};
  const userQuery = Array.isArray(params.user) ? params.user[0] : params.user;
  const normalizedQuery = userQuery?.trim();

  const [
    settings,
    userStats,
    squads,
    searchedUser,
    remnawaveStatus,
    provisioning,
    todayStats,
    weekStats,
    monthStats,
  ] = await Promise.all([
    getSettings(),
    db.user.aggregate({
      _count: {
        id: true,
      },
      _sum: {
        balanceKopeks: true,
      },
      where: {
        role: Role.USER,
      },
    }),
    db.squad.findMany({
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    normalizedQuery
      ? db.user.findFirst({
          where: {
            OR: [
              { id: normalizedQuery },
              { publicId: normalizedQuery },
              { email: normalizedQuery.toLowerCase() },
            ],
          },
          include: {
            squad: true,
            transactions: {
              orderBy: { createdAt: "desc" },
              take: 8,
            },
          },
        })
      : Promise.resolve(null),
    checkRemnawaveConnection(),
    getProvisioningOverview(),
    getAdminStats(getPeriodStart(1)),
    getAdminStats(getPeriodStart(7)),
    getAdminStats(getPeriodStart(30)),
  ]);

  const totalBalance = userStats._sum.balanceKopeks ?? 0;
  const activeUsers = userStats._count.id;

  return (
    <main className="dashboard-shell min-h-screen px-6 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <Badge>Admin console</Badge>
            <div>
              <h1 className="text-3xl font-bold uppercase tracking-[0.08em] text-white">
                Управление 1VPN
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                Поиск пользователя по ID и точечное управление его балансом, баном и устройствами.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className="inline-flex">
              <Button variant="ghost">Вернуться в кабинет</Button>
            </Link>
            <form action={runSyncNowAction}>
              <PendingButton>Запустить синхронизацию</PendingButton>
            </form>
          </div>
        </header>

        <RemnawaveStatusCard initialStatus={remnawaveStatus} />
        <SiteRestartCard />

        <Card>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge>Auto provisioning</Badge>
              <h2 className="mt-4 text-2xl font-bold uppercase tracking-[0.08em] text-white">
                РђРІС‚РѕРїРѕРґРіРѕС‚РѕРІРєР° РЅРѕРґ
              </h2>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                РЎР°Р№С‚ РјРѕР¶РµС‚ РєСѓРїРёС‚СЊ VPS РІ Aeza, РїСЂРѕРїРёСЃР°С‚СЊ DNS РІ Timeweb, СЃРѕР·РґР°С‚СЊ РїСЂРѕС„РёР»СЊ, РЅРѕРґСѓ, С…РѕСЃС‚ Рё СЃРєРІР°Рґ РІ Remnawave. РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ dry-run РЅРµ СЃРїРёСЃС‹РІР°РµС‚ РґРµРЅСЊРіРё.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
                <span className="rounded-full border border-white/10 px-3 py-1">
                  {provisioning.config.enabled ? "enabled" : "disabled"}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1">
                  {provisioning.config.dryRun ? "dry-run" : "real purchases"}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1">
                  targets: {provisioning.config.targets.length}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1">
                  nodes/squad: {provisioning.config.nodesPerSquad}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1">
                  max squads:{" "}
                  {Math.floor(
                    provisioning.config.maxServers / provisioning.config.nodesPerSquad,
                  )}
                </span>
              </div>
              {provisioning.missing.length ? (
                <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Р”Р»СЏ СЂРµР°Р»СЊРЅРѕРіРѕ Р·Р°РїСѓСЃРєР° РЅРµ С…РІР°С‚Р°РµС‚: {provisioning.missing.join(", ")}
                </p>
              ) : null}
            </div>
            <form action={runProvisioningNowAction}>
              <PendingButton>Р—Р°РїСѓСЃС‚РёС‚СЊ Р°РІС‚РѕРїРѕРґРіРѕС‚РѕРІРєСѓ</PendingButton>
            </form>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            {provisioning.jobs.length ? (
              provisioning.jobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-3xl border border-white/10 bg-black/20 p-4"
                >
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                    {job.locationName}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xl font-bold text-white">{job.nodeName}</p>
                    <span className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs text-cyan-100">
                      {job.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">{job.fqdn}</p>
                  {job.groupKey ? (
                    <p className="mt-2 text-xs text-zinc-500">
                      group: {job.groupKey} / node {job.nodeIndex ?? "-"}
                    </p>
                  ) : null}
                  {job.serverIp ? (
                    <p className="mt-2 text-sm text-zinc-300">IP: {job.serverIp}</p>
                  ) : null}
                  {job.lastError ? (
                    <p className="mt-3 text-xs leading-6 text-red-200">{job.lastError}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-400">
                Р—Р°РґР°С‡Рё РїРѕСЏРІСЏС‚СЃСЏ РїРѕСЃР»Рµ РїРµСЂРІРѕРіРѕ Р·Р°РїСѓСЃРєР° Р°РІС‚РѕРїРѕРґРіРѕС‚РѕРІРєРё.
              </p>
            )}
          </div>
        </Card>

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Пользователи</p>
            <p className="mt-3 text-3xl font-bold text-white">{activeUsers}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Суммарный баланс</p>
            <p className="mt-3 text-3xl font-bold text-white">{formatCurrency(totalBalance)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Цена за день</p>
            <p className="mt-3 text-3xl font-bold text-white">
              {formatCurrency(settings.pricePerDayKopeks)}
            </p>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {[
            { label: "Сегодня", stats: todayStats },
            { label: "За 7 дней", stats: weekStats },
            { label: "За 30 дней", stats: monthStats },
          ].map((item) => (
            <Card key={item.label} className="border-cyan-400/15 bg-cyan-500/[0.03]">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{item.label}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm text-zinc-400">Новые пользователи</p>
                  <p className="mt-2 text-3xl font-bold text-white">{item.stats.newUsers}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Покупатели</p>
                  <p className="mt-2 text-3xl font-bold text-white">{item.stats.buyers}</p>
                </div>
              </div>
            </Card>
          ))}
        </section>

        <AdminOperations
          maintenanceEnabled={settings.maintenanceEnabled}
          maintenanceMessage={settings.maintenanceMessage}
        />

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <Badge>Настройки</Badge>
            <form action={updateSettingsAction} className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm text-zinc-300">
                Цена за 1 день, RUB
                <input
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                  defaultValue={settings.pricePerDayKopeks / 100}
                  name="pricePerDay"
                  step="0.01"
                  type="number"
                />
              </label>
              <label className="grid gap-2 text-sm text-zinc-300">
                Дней в trial
                <input
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                  defaultValue={settings.trialDays}
                  name="trialDays"
                  type="number"
                />
              </label>
              <label className="grid gap-2 text-sm text-zinc-300">
                Grace period, часы
                <input
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                  defaultValue={settings.deletionGraceHours}
                  name="deletionGraceHours"
                  readOnly
                  type="number"
                />
                <span className="text-xs text-zinc-500">
                  Пополните баланс в течение 24 часов, чтобы сохранить доступ и данные подписки.
                </span>
              </label>
              <label className="grid gap-2 text-sm text-zinc-300">
                Устройства по умолчанию
                <input
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                  defaultValue={settings.defaultHwidDeviceLimit}
                  name="defaultHwidDeviceLimit"
                  type="number"
                />
              </label>
              <label className="grid gap-2 text-sm text-zinc-300">
                Ссылка на поддержку Telegram
                <input
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                  defaultValue={settings.supportTelegramUrl ?? ""}
                  name="supportTelegramUrl"
                  type="url"
                />
              </label>
              <label className="grid gap-2 text-sm text-zinc-300">
                Hero-анонс
                <input
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                  defaultValue={settings.heroAnnouncement ?? ""}
                  name="heroAnnouncement"
                  type="text"
                />
              </label>
              <label className="flex items-center gap-3 text-sm text-zinc-300">
                <input name="captchaEnabled" type="checkbox" defaultChecked={settings.captchaEnabled} />
                Включить hCaptcha
              </label>
              <PendingButton>Сохранить настройки</PendingButton>
            </form>
          </Card>

          <Card>
            <Badge>Сквады</Badge>
            <h2 className="mt-4 text-2xl font-bold uppercase tracking-[0.08em] text-white">
              Привязка к Remnawave
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              Сквад создается в панели, а здесь вы только добавляете его UUID, лимит пользователей
              и удобное название.
            </p>

            <SquadManager
              squads={squads.map((squad) => ({
                id: squad.id,
                name: squad.name,
                memberLimit: squad.memberLimit,
                isActive: squad.isActive,
                remnawaveInternalSquadUuid: squad.remnawaveInternalSquadUuid,
                userCount: squad._count.users,
              }))}
            />
          </Card>
        </section>

        <section className="space-y-4">
          <div className="space-y-3">
            <Badge>Поиск пользователя</Badge>
            <h2 className="text-2xl font-bold uppercase tracking-[0.08em] text-white">
              Найти по ID
            </h2>
          </div>

          <Card>
            <form className="grid gap-3 md:grid-cols-[1fr_auto]" method="get">
              <input
                className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                defaultValue={normalizedQuery ?? ""}
                name="user"
                placeholder="Введите короткий ID пользователя"
                type="text"
              />
              <Button type="submit">Показать пользователя</Button>
            </form>
          </Card>

          {normalizedQuery ? (
            searchedUser ? (
              (() => {
                const effectiveDeviceCount = Math.max(
                  1,
                  searchedUser.hwidDeviceLimit ?? settings.defaultHwidDeviceLimit,
                );
                const remainingDays =
                  settings.pricePerDayKopeks > 0
                    ? searchedUser.balanceKopeks / (settings.pricePerDayKopeks * effectiveDeviceCount)
                    : 0;
                const vpnStatus = getVpnStatusLabel({
                  isBanned: searchedUser.isBanned,
                  balanceKopeks: searchedUser.balanceKopeks,
                  vpnProvisionState: searchedUser.vpnProvisionState,
                });

                return (
                  <UserManagerModal
                    user={{
                      id: searchedUser.id,
                      publicId: searchedUser.publicId ?? "pending",
                      email: searchedUser.email,
                      squadName: searchedUser.squad?.name ?? "не назначен",
                      remnawaveUserUuid: searchedUser.remnawaveUserUuid ?? "ещё не создан",
                      subscriptionUrl:
                        searchedUser.subscriptionUrl ?? "Ссылка подписки ещё не сгенерирована",
                      balance: formatCurrency(searchedUser.balanceKopeks),
                      remainingDays: formatDays(remainingDays),
                      deviceCount: effectiveDeviceCount,
                      hwidDeviceLimit: searchedUser.hwidDeviceLimit,
                      defaultHwidDeviceLimit: settings.defaultHwidDeviceLimit,
                      vpnStatus,
                      vpnProvisionState: searchedUser.vpnProvisionState,
                      vpnStatusMessage:
                        searchedUser.vpnStatusMessage ?? "Синхронизация ещё не запускалась.",
                      isBanned: searchedUser.isBanned,
                      transactions: searchedUser.transactions.map((transaction) => ({
                        id: transaction.id,
                        label: getTransactionLabel(transaction.type),
                        description: transaction.description,
                        amount: formatCurrency(transaction.amountKopeks),
                        positive: transaction.amountKopeks >= 0,
                        createdAt: transaction.createdAt.toLocaleString("ru-RU"),
                      })),
                    }}
                  />
                );
              })()
            ) : (
              <Card>
                <p className="text-sm text-zinc-400">Пользователь с таким ID не найден.</p>
              </Card>
            )
          ) : (
            <Card>
              <p className="text-sm text-zinc-400">
                Введите ID пользователя, чтобы посмотреть его данные, историю и действия.
              </p>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}
