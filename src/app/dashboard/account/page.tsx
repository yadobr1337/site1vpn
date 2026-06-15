import Link from "next/link";
import { resendOwnEmailVerificationAction, updateOwnEmailAction, updateOwnPasswordAction, verifyOwnEmailAction } from "@/app/actions";
import { TelegramLogin } from "@/components/auth/telegram-login";
import { LogoutButton } from "@/components/logout-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PendingButton } from "@/components/ui/pending-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ensureUserPublicId } from "@/lib/user-identity";

function getEmailStatusMessage(status?: string) {
  switch (status) {
    case "sent":
      return { tone: "success", text: "Код отправлен на email." };
    case "resent":
      return { tone: "success", text: "Код отправлен повторно." };
    case "verified":
      return { tone: "success", text: "Email подтвержден." };
    case "smtp_missing":
      return { tone: "error", text: "SMTP не настроен. Заполните SMTP-переменные в .env." };
    case "smtp_auth_error":
      return {
        tone: "error",
        text: "SMTP отклонил авторизацию. Для Яндекса обычно нужен пароль приложения.",
      };
    case "send_error":
      return { tone: "error", text: "Не удалось отправить письмо. Проверьте SMTP-настройки." };
    case "email_exists":
      return { tone: "error", text: "Этот email уже используется другим аккаунтом." };
    case "invalid_code":
      return { tone: "error", text: "Неверный или просроченный код." };
    case "no_pending_email":
      return { tone: "error", text: "Сначала запросите код для email." };
    default:
      return null;
  }
}

type SearchParamsInput =
  | Promise<{ emailStatus?: string | string[] }>
  | { emailStatus?: string | string[] }
  | undefined;

export default async function DashboardAccountPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const session = await requireUser();
  const params = searchParams ? await searchParams : {};
  const emailStatus = Array.isArray(params.emailStatus) ? params.emailStatus[0] : params.emailStatus;
  const statusMessage = getEmailStatusMessage(emailStatus);

  const [user, publicId] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        pendingEmail: true,
        emailVerified: true,
        passwordHash: true,
        telegramId: true,
        telegramUsername: true,
        isEmailPlaceholder: true,
      },
    }),
    ensureUserPublicId(session.user.id),
  ]);

  if (!user) return null;

  const hasRealEmail = !user.isEmailPlaceholder;
  const emailLabel = hasRealEmail ? user.email : "Email не привязан";

  return (
    <main className="dashboard-shell min-h-screen px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge>Account settings</Badge>
            <h1 className="mt-4 text-3xl font-bold uppercase tracking-[0.08em] text-white">{publicId}</h1>
            <p className="mt-2 text-sm text-zinc-400">{emailLabel}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/">
              <Button variant="ghost">Главная</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="ghost">Назад</Button>
            </Link>
          </div>
        </header>

        {statusMessage ? (
          <Card
            className={
              statusMessage.tone === "success"
                ? "border-emerald-400/20 bg-emerald-500/10"
                : "border-red-400/20 bg-red-500/10"
            }
          >
            <p className="text-sm text-white">{statusMessage.text}</p>
          </Card>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-5">
            <Badge>Email</Badge>
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-[0.08em] text-white">
                Почта и подтверждение
              </h2>
              <p className="mt-2 text-sm leading-7 text-zinc-400">
                Подтвержденный email нужен для уведомлений и восстановления пароля.
              </p>
            </div>

            <form action={updateOwnEmailAction} className="space-y-4">
              <label className="grid gap-2 text-sm text-zinc-300">
                {hasRealEmail ? "Изменить email" : "Добавить email"}
                <input
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                  defaultValue={user.pendingEmail ?? (hasRealEmail ? user.email : "")}
                  name="email"
                  placeholder="you@domain.com"
                  type="email"
                />
              </label>
              <PendingButton>
                {hasRealEmail ? "Отправить код на новый email" : "Отправить код"}
              </PendingButton>
            </form>

            {user.pendingEmail || (hasRealEmail && !user.emailVerified) ? (
              <div className="space-y-4 rounded-3xl border border-cyan-300/15 bg-cyan-400/8 p-4">
                <p className="text-sm text-zinc-200">
                  {user.pendingEmail
                    ? `Ожидает подтверждения: ${user.pendingEmail}`
                    : "Текущий email еще не подтвержден."}
                </p>
                <form action={verifyOwnEmailAction} className="flex flex-col gap-3 sm:flex-row">
                  <input
                    className="h-12 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                    name="code"
                    placeholder="Код из письма"
                    type="text"
                  />
                  <PendingButton>Подтвердить</PendingButton>
                </form>
                <form action={resendOwnEmailVerificationAction}>
                  <PendingButton variant="ghost">Отправить код повторно</PendingButton>
                </form>
              </div>
            ) : (
              <p className="text-sm text-emerald-300">Email подтвержден.</p>
            )}
          </Card>

          <Card className="space-y-5">
            <Badge>Password</Badge>
            <h2 className="text-2xl font-bold uppercase tracking-[0.08em] text-white">Пароль</h2>
            <p className="text-sm leading-7 text-zinc-400">
              Если забудете пароль, восстановить его можно кодом из email на странице входа.
            </p>
            <form action={updateOwnPasswordAction} className="space-y-4">
              {user.passwordHash ? (
                <label className="grid gap-2 text-sm text-zinc-300">
                  Текущий пароль
                  <input
                    className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                    name="currentPassword"
                    type="password"
                  />
                </label>
              ) : null}
              <label className="grid gap-2 text-sm text-zinc-300">
                Новый пароль
                <input
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                  name="newPassword"
                  type="password"
                />
              </label>
              <PendingButton>Сохранить пароль</PendingButton>
            </form>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-5">
            <Badge>Telegram</Badge>
            <h2 className="text-2xl font-bold uppercase tracking-[0.08em] text-white">
              Привязка Telegram
            </h2>
            <p className="text-sm leading-7 text-zinc-400">
              Используйте Telegram Login Widget, чтобы привязать бота к текущему аккаунту.
            </p>
            <p className="text-sm text-zinc-300">
              Текущее состояние:{" "}
              <span className="font-semibold text-white">
                {user.telegramId ? `@${user.telegramUsername ?? user.telegramId}` : "Telegram не привязан"}
              </span>
            </p>
            {user.telegramId ? (
              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                <p className="text-sm text-emerald-200">
                  Telegram уже привязан. Уведомления о балансе и подписке будут приходить в этот
                  аккаунт после старта бота.
                </p>
              </div>
            ) : (
              <TelegramLogin mode="link" />
            )}
          </Card>

          <Card>
            <Badge>Support</Badge>
            <div className="mt-4 flex flex-wrap gap-3">
              {env.NEXT_PUBLIC_SUPPORT_TELEGRAM_URL ? (
                <Link href={env.NEXT_PUBLIC_SUPPORT_TELEGRAM_URL} target="_blank" rel="noreferrer">
                  <Button>Поддержка в Telegram</Button>
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

        <div className="flex justify-end">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
