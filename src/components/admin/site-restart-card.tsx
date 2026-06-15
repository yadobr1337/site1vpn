"use client";

import { useActionState } from "react";
import {
  restartSiteAction,
  type SiteRestartActionState,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const initialState: SiteRestartActionState = {
  status: "idle",
  message: "",
};

export function SiteRestartCard() {
  const [state, action, pending] = useActionState(restartSiteAction, initialState);

  return (
    <Card className="border-amber-400/20 bg-amber-500/[0.04]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Badge>Управление сайтом</Badge>
          <h2 className="mt-4 text-xl font-bold uppercase tracking-[0.08em] text-white">
            Полная перезагрузка
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Перезапускает весь процесс сайта. Во время перезапуска он будет недоступен несколько
            секунд.
          </p>
          {state.message ? (
            <p
              aria-live="polite"
              className={`mt-3 text-sm ${
                state.status === "error" ? "text-red-200" : "text-emerald-200"
              }`}
            >
              {state.message}
            </p>
          ) : null}
        </div>

        <form
          action={action}
          onSubmit={(event) => {
            if (!window.confirm("Полностью перезапустить сайт прямо сейчас?")) {
              event.preventDefault();
            }
          }}
        >
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Отправляем запрос..." : "Перезагрузить сайт"}
          </Button>
        </form>
      </div>
    </Card>
  );
}
