"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type LinkResponse = {
  error?: string;
  url?: string;
};

export function TelegramBotLink() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function startLinking() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/telegram/link/start", {
        method: "POST",
      });
      const payload = (await response.json()) as LinkResponse;

      if (!response.ok || !payload.url) {
        setError(payload.error ?? "Не удалось создать ссылку привязки Telegram.");
        return;
      }

      window.location.href = payload.url;
    } catch {
      setError("Не удалось открыть Telegram. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={startLinking} disabled={pending}>
          {pending ? "Открываем Telegram..." : "Подтвердить через @VPNthe1_bot"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.refresh()}>
          Проверить привязку
        </Button>
      </div>
      <p className="text-sm leading-6 text-zinc-400">
        В Telegram нажмите Start. После подтверждения станут доступны бесплатный день и уведомления.
        Одноразовая ссылка действует 15 минут.
      </p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
