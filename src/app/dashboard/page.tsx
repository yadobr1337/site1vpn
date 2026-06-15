import Link from "next/link";
import {
  claimTrialAction,
  deleteOwnHwidDeviceAction,
  topUpBalanceAction,
  updateOwnHwidAction,
} from "@/app/actions";
import { BillingModal } from "@/components/billing-modal";
import { CopyButton } from "@/components/copy-button";
import { DeviceStepperForm } from "@/components/device-stepper-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PendingButton } from "@/components/ui/pending-button";
import { requireUser } from "@/lib/auth";
import { getUserOverview } from "@/lib/billing";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getRemoteUserDevices } from "@/lib/remnawave";
import { ensureUserPublicId } from "@/lib/user-identity";
import { formatCurrency, formatDays } from "@/lib/utils";

function getVpnStatusLabel(
  balanceKopeks: number,
  vpnProvisionState: string,
  isBanned: boolean,
) {
  if (isBanned) {
    return "Заблокирован";
  }

  if (balanceKopeks <= 0) {
    return "Ожидает оплаты";
  }

  if (vpnProvisionState === "ACTIVE") {
    return "Активный";
  }

  if (vpnProvisionState === "ERROR") {
    return "Ошибка панели";
  }

  return "Синхронизация";
}

export default async function DashboardPage() {
  const session = await requireUser();
  const [overview, publicId, transactions] = await Promise.all([
    getUserOverview(session.user.id),
    ensureUserPublicId(session.user.id),
    db.balanceTransaction.findMany({
      where: {
        userId: session.user.id,
        amountKopeks: {
          gt: 0,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  if (!overview) {
    return null;
  }

  const devices = await getRemoteUserDevices(overview.user.remnawaveUserUuid);
  const canClaimTrial = !overview.user.trialClaimedAt;
  const hasLinkedTelegram = Boolean(overview.user.telegramId);
  const hasRealEmail = !overview.user.isEmailPlaceholder;
  const emailNeedsVerification = Boolean(
    overview.user.pendingEmail || (hasRealEmail && !overview.user.emailVerified),
  );
  const supportTelegramUrl =
    env.NEXT_PUBLIC_SUPPORT_TELEGRAM_URL ?? overview.settings.supportTelegramUrl ?? null;

  return (
    <main className="dashboard-shell min-h-screen px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge>Client dashboard</Badge>
            <h1 className="mt-4 text-3xl font-bold uppercase tracking-[0.08em] text-white">
              {publicId}
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              {hasRealEmail ? overview.user.email : "Email не привязан"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/">
              <Button variant="ghost">Главная</Button>
            </Link>
            <Link href="/dashboard/account">
              <Button variant="ghost">Настройки аккаунта</Button>
            </Link>
            {session.user.role === "ADMIN" ? (
              <Link href="/admin">
                <Button variant="ghost">Админ</Button>
              </Link>
            ) : null}
          </div>
        </header>

        {!hasRealEmail || emailNeedsVerification ? (
          <Card className="border-cyan-300/20 bg-cyan-400/8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">
                  Email
                </p>
                <p className="mt-2 text-sm leading-7 text-zinc-200">
                  {!hasRealEmail
                    ? "Добавьте email в настройках аккаунта. Без него недоступны восстановление пароля и часть уведомлений."
                    : "Подтвердите email кодом из письма, чтобы использовать уведомления и восстановление пароля."}
                </p>
              </div>
              <Link href="/dashboard/account">
                <Button>Открыть настройки</Button>
              </Link>
            </div>
          </Card>
        ) : null}

        {overview.user.isBanned ? (
          <Card className="border-red-400/20 bg-red-500/10">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-200">
                Блокировка
              </p>
              <p className="text-sm leading-7 text-zinc-100">
                Ваш аккаунт заблокирован администратором. Доступ к VPN приостановлен до разбана.
              </p>
            </div>
          </Card>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
          <Card className="space-y-5">
            <Badge>Подписка</Badge>
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold uppercase tracking-[0.08em] text-white">
                  Ссылка доступа
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Откройте подписку напрямую или скопируйте ссылку в приложение.
                </p>
              </div>
              {overview.user.subscriptionUrl ? (
                <>
                  <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
                    <p className="break-all font-mono text-xs leading-6 text-cyan-200">
                      {overview.user.subscriptionUrl}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={overview.user.subscriptionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/15 px-5 text-sm font-medium text-cyan-100 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/70 hover:bg-cyan-400/25"
                    >
                      Подключиться
                    </a>
                    <CopyButton value={overview.user.subscriptionUrl} />
                  </div>
                </>
              ) : (
                <p className="text-sm leading-7 text-zinc-400">
                  Ссылка появится после оплаты и успешной синхронизации с VPN-панелью.
                </p>
              )}
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Баланс</p>
              <p className="mt-3 text-3xl font-bold text-white">
                {formatCurrency(overview.user.balanceKopeks)}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Остаток дней</p>
              <p className="mt-3 text-3xl font-bold text-white">{formatDays(overview.remainingDays)}</p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Статус VPN</p>
              <p className="mt-3 text-xl font-bold text-white">
                {getVpnStatusLabel(
                  overview.user.balanceKopeks,
                  overview.user.vpnProvisionState,
                  overview.user.isBanned,
                )}
              </p>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="space-y-5">
            <Badge>Баланс</Badge>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-bold uppercase tracking-[0.08em] text-white">
                  Пополнение
                </h2>
                <p className="mt-2 text-sm leading-7 text-zinc-400">
                  Все пополнения и история операций вынесены в отдельное окно.
                </p>
              </div>
              <BillingModal
                topUpAction={topUpBalanceAction}
                transactions={transactions.map((transaction) => ({
                  id: transaction.id,
                  description: transaction.description,
                  amount: formatCurrency(transaction.amountKopeks),
                  createdAt: transaction.createdAt.toLocaleString("ru-RU"),
                }))}
              />
            </div>
          </Card>

          <Card className="space-y-5">
            <Badge>Устройства</Badge>
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold uppercase tracking-[0.08em] text-white">
                  HWID и лимиты
                </h2>
                <p className="mt-2 text-sm leading-7 text-zinc-400">
                  Настройте лимит устройств и при необходимости удалите конкретное устройство из
                  панели.
                </p>
              </div>

              <DeviceStepperForm
                action={updateOwnHwidAction}
                currentValue={overview.effectiveHwidDeviceLimit}
              />

              <div className="space-y-3">
                {devices.length ? (
                  devices.map((device) => (
                    <div
                      key={device.hwid}
                      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {device.deviceModel || device.platform || `Устройство ${device.hwid.slice(0, 8)}`}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">HWID: {device.hwid}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Последний вход: {device.updatedAt.toLocaleString("ru-RU")}
                        </p>
                      </div>
                      <form action={deleteOwnHwidDeviceAction}>
                        <input type="hidden" name="hwid" value={device.hwid} />
                        <Button variant="danger" type="submit">
                          Удалить
                        </Button>
                      </form>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-400">
                    Активные устройства появятся после подключений через VPN-панель.
                  </div>
                )}
              </div>
            </div>
          </Card>
        </section>

        {canClaimTrial ? (
          <section>
            <Card className="space-y-5">
              <Badge>Бонус</Badge>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-2xl font-bold uppercase tracking-[0.08em] text-white">
                    Пробный день
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">
                    Один раз можно получить баланс на 1 день. Для активации нужно привязать
                    Telegram.
                  </p>
                </div>

                {hasLinkedTelegram ? (
                  <form action={claimTrialAction}>
                    <PendingButton>Получить пробный день</PendingButton>
                  </form>
                ) : (
                  <Link href="/dashboard/account">
                    <Button>Привязать Telegram</Button>
                  </Link>
                )}
              </div>
            </Card>
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card>
            <Badge>Инфо</Badge>
            <div className="mt-4 space-y-2 text-sm text-zinc-300">
              <p>Цена за день: {formatCurrency(overview.settings.pricePerDayKopeks)}</p>
              <p>Telegram: {overview.user.telegramId ?? "не привязан"}</p>
              <p>
                При нулевом балансе ссылка отключается и удаляется через{" "}
                {overview.settings.deletionGraceHours} ч.
              </p>
            </div>
          </Card>

          <Card>
            <Badge>Поддержка</Badge>
            <div className="mt-4 flex flex-wrap gap-3">
              {supportTelegramUrl ? (
                <Link href={supportTelegramUrl} target="_blank" rel="noreferrer">
                  <Button>Telegram</Button>
                </Link>
              ) : null}
              {env.SUPPORT_EMAIL ? (
                <Link href={`mailto:${env.SUPPORT_EMAIL}`}>
                  <Button variant="ghost">{env.SUPPORT_EMAIL}</Button>
                </Link>
              ) : null}
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
