import Link from "next/link";
import { Role, TransactionType, VpnProvisionState } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PendingButton } from "@/components/ui/pending-button";
import { RemnawaveStatusCard } from "@/components/admin/remnawave-status-card";
import { SquadManager } from "@/components/admin/squad-manager";
import { UserManagerModal } from "@/components/admin/user-manager-modal";
import {
  runSyncNowAction,
  updateSettingsAction,
} from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { checkRemnawaveConnection } from "@/lib/remnawave";
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

  const [settings, userStats, squads, searchedUser, remnawaveStatus] = await Promise.all([
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
                  type="number"
                />
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
                Включить CAPTCHA
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
