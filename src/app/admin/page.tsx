import Link from "next/link";
import { Role, TransactionType, VpnProvisionState } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PendingButton } from "@/components/ui/pending-button";
import {
  adjustUserBalanceAction,
  createSquadAction,
  deleteSquadAction,
  runSyncNowAction,
  toggleBanAction,
  updateSettingsAction,
  updateSquadLimitAction,
  updateUserHwidAction,
} from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
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

  return "Ожидает оплаты";
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

  const [settings, userStats, squads, searchedUser] = await Promise.all([
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

            <form
              action={createSquadAction}
              className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_1fr_180px_auto]"
            >
              <input
                className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                name="remnawaveInternalSquadUuid"
                placeholder="UUID сквада Remnawave"
                required
              />
              <input
                className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                name="name"
                placeholder="Название для админки"
              />
              <input
                className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                name="memberLimit"
                placeholder="Лимит"
                required
                type="number"
              />
              <PendingButton>Добавить сквад</PendingButton>
            </form>

            <div className="mt-6 space-y-3">
              {squads.length ? (
                squads.map((squad) => (
                  <div key={squad.id} className="rounded-3xl border border-white/10 bg-black/20 p-4">
                    <form
                      action={updateSquadLimitAction}
                      className="grid gap-3 xl:grid-cols-[1fr_1.2fr_160px_auto_auto]"
                    >
                      <input type="hidden" name="squadId" value={squad.id} />
                      <input
                        className="h-11 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                        defaultValue={squad.name}
                        name="name"
                        placeholder="Название"
                      />
                      <input
                        className="h-11 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                        defaultValue={squad.remnawaveInternalSquadUuid ?? ""}
                        name="remnawaveInternalSquadUuid"
                        placeholder="UUID сквада"
                        required
                      />
                      <input
                        className="h-11 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                        defaultValue={squad.memberLimit}
                        name="memberLimit"
                        type="number"
                      />
                      <label className="flex items-center gap-2 text-sm text-zinc-300">
                        <input defaultChecked={squad.isActive} name="isActive" type="checkbox" />
                        active
                      </label>
                      <div className="flex gap-3">
                        <PendingButton variant="ghost">Обновить</PendingButton>
                        <button
                          formAction={deleteSquadAction}
                          name="squadId"
                          value={squad.id}
                          className="inline-flex h-11 items-center justify-center rounded-full border border-red-400/35 bg-red-500/10 px-5 text-sm font-medium text-red-100 transition duration-300 hover:border-red-400/60 hover:bg-red-500/20"
                        >
                          Удалить
                        </button>
                      </div>
                    </form>
                    <p className="mt-3 text-sm text-zinc-400">
                      Занято {squad._count.users} из {squad.memberLimit} мест
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-zinc-400">
                  Сквады еще не добавлены. Пока что пользователи будут создаваться без назначения, а
                  выдача VPN останется в ожидании.
                </div>
              )}
            </div>
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
                  <Card className="space-y-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <p className="font-mono text-lg font-semibold text-white">
                          ID: {searchedUser.publicId ?? "pending"}
                        </p>
                        <p className="text-sm text-zinc-400">{searchedUser.email}</p>
                        <p className="text-xs text-zinc-500">Internal: {searchedUser.id}</p>
                        <p className="text-sm text-zinc-500">
                          Сквад: {searchedUser.squad?.name ?? "не назначен"}
                        </p>
                        <p className="text-sm text-zinc-500">
                          Remnawave user UUID: {searchedUser.remnawaveUserUuid ?? "еще не создан"}
                        </p>
                        <p className="text-sm text-zinc-500">
                          {searchedUser.subscriptionUrl ?? "Ссылка подписки еще не сгенерирована"}
                        </p>
                      </div>

                      <div className="grid gap-2 text-right text-sm text-zinc-300">
                        <p>Баланс: {formatCurrency(searchedUser.balanceKopeks)}</p>
                        <p>Остаток: {formatDays(remainingDays)} дн.</p>
                        <p>Устройства: {effectiveDeviceCount}</p>
                        <p>Статус VPN: {vpnStatus}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[auto_220px_1fr]">
                      <form action={toggleBanAction} className="flex items-center gap-3">
                        <input type="hidden" name="userId" value={searchedUser.id} />
                        <input type="hidden" name="ban" value={String(!searchedUser.isBanned)} />
                        <PendingButton variant={searchedUser.isBanned ? "ghost" : "danger"}>
                          {searchedUser.isBanned ? "Разбанить" : "Забанить"}
                        </PendingButton>
                      </form>

                      <form action={updateUserHwidAction} className="flex items-center gap-3">
                        <input type="hidden" name="userId" value={searchedUser.id} />
                        <input
                          className="h-11 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                          defaultValue={searchedUser.hwidDeviceLimit ?? ""}
                          name="hwidDeviceLimit"
                          placeholder={`По умолчанию: ${settings.defaultHwidDeviceLimit}`}
                          type="number"
                        />
                        <PendingButton variant="ghost">Устройства</PendingButton>
                      </form>

                      <form action={adjustUserBalanceAction} className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
                        <input type="hidden" name="userId" value={searchedUser.id} />
                        <input
                          className="h-11 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                          defaultValue="100"
                          name="amount"
                          step="1"
                          type="number"
                        />
                        <input
                          className="h-11 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                          defaultValue="Ручное пополнение из админки"
                          name="description"
                          type="text"
                        />
                        <PendingButton variant="ghost">Пополнить баланс</PendingButton>
                      </form>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">
                        История операций
                      </p>
                      <div className="grid gap-3">
                        {searchedUser.transactions.length ? (
                          searchedUser.transactions.map((transaction) => (
                            <div
                              key={transaction.id}
                              className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3"
                            >
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {getTransactionLabel(transaction.type)}
                                </p>
                                <p className="text-xs text-zinc-500">{transaction.description}</p>
                              </div>
                              <div className="text-right">
                                <p
                                  className={`text-sm font-semibold ${
                                    transaction.amountKopeks >= 0 ? "text-cyan-200" : "text-zinc-200"
                                  }`}
                                >
                                  {transaction.amountKopeks >= 0 ? "+" : ""}
                                  {formatCurrency(transaction.amountKopeks)}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {transaction.createdAt.toLocaleString("ru-RU")}
                                </p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-400">
                            Операций пока нет.
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
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
