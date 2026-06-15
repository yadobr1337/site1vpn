"use client";

import { useActionState } from "react";
import { refreshRemnawaveStatusAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RemnawaveConnectionStatus } from "@/lib/remnawave";
import { cn } from "@/lib/utils";

const stateDetails = {
  connected: {
    label: "Подключено",
    indicatorClassName: "bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.75)]",
    badgeClassName: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
  },
  error: {
    label: "Ошибка подключения",
    indicatorClassName: "bg-red-300 shadow-[0_0_16px_rgba(252,165,165,0.75)]",
    badgeClassName: "border-red-400/25 bg-red-500/10 text-red-200",
  },
  not_configured: {
    label: "Не настроено",
    indicatorClassName: "bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.65)]",
    badgeClassName: "border-amber-400/25 bg-amber-500/10 text-amber-100",
  },
} satisfies Record<
  RemnawaveConnectionStatus["state"],
  { label: string; indicatorClassName: string; badgeClassName: string }
>;

function formatUptime(seconds: number | null) {
  if (seconds === null) {
    return "—";
  }

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  return days > 0 ? `${days} д. ${hours} ч.` : `${hours} ч.`;
}

function formatCheckedAt(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

export function RemnawaveStatusCard({
  initialStatus,
}: {
  initialStatus: RemnawaveConnectionStatus;
}) {
  const [status, refreshAction, pending] = useActionState(
    refreshRemnawaveStatusAction,
    initialStatus,
  );
  const details = stateDetails[status.state];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Remnawave API</Badge>
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em]",
                details.badgeClassName,
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", details.indicatorClassName)} />
              {details.label}
            </span>
          </div>
          <div>
            <p className="text-lg font-semibold text-white">{status.message}</p>
            <p className="mt-1 break-all text-sm text-zinc-500">
              {status.baseUrl ?? "URL панели не указан"}
            </p>
          </div>
        </div>

        <form action={refreshAction}>
          <Button type="submit" variant="ghost" disabled={pending}>
            {pending ? "Проверяем..." : "Обновить статус"}
          </Button>
        </form>
      </div>

      <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Задержка</p>
          <p className="mt-1 text-sm font-medium text-zinc-200">
            {status.latencyMs === null ? "—" : `${status.latencyMs} мс`}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Инстансы</p>
          <p className="mt-1 text-sm font-medium text-zinc-200">{status.instanceCount ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Uptime</p>
          <p className="mt-1 text-sm font-medium text-zinc-200">
            {formatUptime(status.uptimeSeconds)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Проверено</p>
          <p className="mt-1 text-sm font-medium text-zinc-200">{formatCheckedAt(status.checkedAt)}</p>
        </div>
      </div>
    </Card>
  );
}
