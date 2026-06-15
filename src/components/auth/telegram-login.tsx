"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { publicEnv } from "@/lib/public-env";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string>) => void;
  }
}

type TelegramLoginProps = {
  mode?: "login" | "link";
  onLinked?: () => void;
};

export function TelegramLogin({ mode = "login", onLinked }: TelegramLoginProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const botUsername = publicEnv.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    if (!botUsername || !containerRef.current) {
      return;
    }

    window.onTelegramAuth = async (user) => {
      setError(null);
      setSuccess(null);

      if (mode === "link") {
        const response = await fetch("/api/telegram/link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(user),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? "Не удалось привязать Telegram.");
          return;
        }

        setSuccess("Telegram успешно привязан.");
        router.refresh();
        onLinked?.();
        return;
      }

      const result = await signIn("telegram", {
        ...user,
        redirect: false,
        callbackUrl: "/dashboard",
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      window.location.href = "/dashboard";
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "999");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(script);

    return () => {
      delete window.onTelegramAuth;
    };
  }, [mode, onLinked, router]);

  if (!publicEnv.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME) {
    return (
      <p className="text-sm text-zinc-400">
        Telegram будет доступен после заполнения `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="min-h-12" />
      {success ? <p className="text-sm text-emerald-300">{success}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
