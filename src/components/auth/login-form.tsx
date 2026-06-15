"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { TelegramLogin } from "@/components/auth/telegram-login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [resetMode, setResetMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      {!resetMode ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setMessage(null);
            const form = event.currentTarget;

            startTransition(async () => {
              const formData = new FormData(form);
              const result = await signIn("credentials", {
                email: String(formData.get("email") ?? ""),
                password: String(formData.get("password") ?? ""),
                redirect: false,
                callbackUrl: "/dashboard",
              });

              if (result?.error) {
                setError("Неверный email или пароль.");
                return;
              }

              window.location.href = "/dashboard";
            });
          }}
        >
          <div className="space-y-2">
            <label className="text-sm text-zinc-300">Email</label>
            <Input name="email" type="email" placeholder="you@domain.com" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-zinc-300">Пароль</label>
            <Input name="password" type="password" placeholder="••••••••" required />
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button
            type="button"
            onClick={() => {
              setResetMode(true);
              setError(null);
              setMessage(null);
            }}
            className="text-sm text-cyan-300 transition hover:text-cyan-200"
          >
            Забыли пароль?
          </button>
          <Button className="w-full" disabled={pending}>
            {pending ? "Вход..." : "Войти"}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setMessage(null);
            const form = event.currentTarget;

            startTransition(async () => {
              const formData = new FormData(form);
              const email = String(formData.get("email") ?? "");
              const code = String(formData.get("code") ?? "");
              const password = String(formData.get("password") ?? "");

              const response = await fetch("/api/auth/password-reset/confirm", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, code, password }),
              });

              const payload = (await response.json()) as { error?: string };
              if (!response.ok) {
                setError(payload.error ?? "Не удалось обновить пароль.");
                return;
              }

              setMessage("Пароль обновлен. Теперь можно войти с новым паролем.");
              form.reset();
            });
          }}
        >
          <div className="space-y-2">
            <label className="text-sm text-zinc-300">Email</label>
            <Input name="email" type="email" placeholder="you@domain.com" required />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Код</label>
              <Input name="code" inputMode="numeric" placeholder="123456" required />
            </div>
            <button
              type="button"
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (!form) return;

                const formData = new FormData(form);
                const email = String(formData.get("email") ?? "").trim();
                if (!email) {
                  setError("Введите email, чтобы получить код.");
                  return;
                }

                setError(null);
                setMessage(null);

                startTransition(async () => {
                  const response = await fetch("/api/auth/password-reset/request", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ email }),
                  });

                  const payload = (await response.json()) as { error?: string };
                  if (!response.ok) {
                    setError(payload.error ?? "Не удалось отправить код.");
                    return;
                  }

                  setMessage("Код для сброса пароля отправлен на email.");
                });
              }}
              className="mt-7 inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              Получить код
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-zinc-300">Новый пароль</label>
            <Input name="password" type="password" placeholder="Новый пароль" required />
          </div>
          {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button
            type="button"
            onClick={() => {
              setResetMode(false);
              setError(null);
              setMessage(null);
            }}
            className="text-sm text-zinc-400 transition hover:text-white"
          >
            Назад ко входу
          </button>
          <Button className="w-full" disabled={pending}>
            {pending ? "Сохранение..." : "Сбросить пароль"}
          </Button>
        </form>
      )}

      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-zinc-500">
        <span className="h-px flex-1 bg-white/10" />
        Telegram
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <TelegramLogin mode="login" />

      <p className="text-sm text-zinc-400">
        Нет аккаунта?{" "}
        <Link href="/register" className="text-cyan-300 transition hover:text-cyan-200">
          Зарегистрироваться
        </Link>
      </p>
    </div>
  );
}
