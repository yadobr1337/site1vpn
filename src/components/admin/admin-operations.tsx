"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Gift, Radio, Wrench } from "lucide-react";
import {
  broadcastTelegramAction,
  grantDaysToAllUsersAction,
  updateMaintenanceAction,
  type AdminOperationActionState,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PendingButton } from "@/components/ui/pending-button";

type Operation = "days" | "maintenance" | "broadcast";

const initialState: AdminOperationActionState = {
  status: "idle",
  message: "",
};

function ResultMessage({ state }: { state: AdminOperationActionState }) {
  if (!state.message) return null;

  return (
    <p
      aria-live="polite"
      className={state.status === "error" ? "text-sm text-red-300" : "text-sm text-emerald-300"}
    >
      {state.message}
    </p>
  );
}

function OperationModal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        aria-label="Закрыть окно"
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,20,29,0.99),rgba(8,11,17,0.99))] p-5 shadow-[0_28px_120px_rgba(0,0,0,0.7)] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge>Массовое управление</Badge>
            <h2 className="mt-4 text-2xl font-bold uppercase tracking-[0.06em] text-white">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-7 text-zinc-400">{description}</p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function AdminOperations({
  maintenanceEnabled,
  maintenanceMessage,
}: {
  maintenanceEnabled: boolean;
  maintenanceMessage: string | null;
}) {
  const [operation, setOperation] = useState<Operation | null>(null);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [daysState, daysAction] = useActionState(grantDaysToAllUsersAction, initialState);
  const [maintenanceState, maintenanceAction] = useActionState(
    updateMaintenanceAction,
    initialState,
  );
  const [broadcastState, broadcastAction] = useActionState(
    broadcastTelegramAction,
    initialState,
  );

  useEffect(() => {
    if (!operation) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [operation]);

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="border-cyan-400/20 bg-cyan-500/[0.04]">
          <Gift className="h-6 w-6 text-cyan-200" />
          <h2 className="mt-4 text-xl font-bold uppercase tracking-[0.06em] text-white">
            Начислить дни
          </h2>
          <p className="mt-2 min-h-14 text-sm leading-6 text-zinc-400">
            Добавить одинаковое количество дней подписки всем пользователям.
          </p>
          <Button className="mt-5" onClick={() => setOperation("days")}>
            Открыть
          </Button>
        </Card>

        <Card className="border-amber-400/20 bg-amber-500/[0.04]">
          <Wrench className="h-6 w-6 text-amber-200" />
          <h2 className="mt-4 text-xl font-bold uppercase tracking-[0.06em] text-white">
            Технический режим
          </h2>
          <p className="mt-2 min-h-14 text-sm leading-6 text-zinc-400">
            Закрыть сайт для пользователей. Администраторы сохранят доступ.
          </p>
          <Button className="mt-5" variant="ghost" onClick={() => setOperation("maintenance")}>
            {maintenanceEnabled ? "Сейчас включён" : "Настроить"}
          </Button>
        </Card>

        <Card className="border-violet-400/20 bg-violet-500/[0.04]">
          <Radio className="h-6 w-6 text-violet-200" />
          <h2 className="mt-4 text-xl font-bold uppercase tracking-[0.06em] text-white">
            Telegram-рассылка
          </h2>
          <p className="mt-2 min-h-14 text-sm leading-6 text-zinc-400">
            Отправить всем подтвердившим бота красивое сообщение с фотографией.
          </p>
          <Button className="mt-5" variant="ghost" onClick={() => setOperation("broadcast")}>
            Создать рассылку
          </Button>
        </Card>
      </section>

      {mounted && operation === "days" ? (
        <OperationModal
          title="Начислить дни всем"
          description="Сумма рассчитывается отдельно для каждого пользователя с учётом его количества устройств."
          onClose={() => setOperation(null)}
        >
          <form action={daysAction} className="space-y-4">
            <label className="grid gap-2 text-sm text-zinc-300">
              Количество дней
              <input
                className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                min="1"
                max="3650"
                name="days"
                required
                type="number"
              />
            </label>
            <label className="grid gap-2 text-sm text-zinc-300">
              Сообщение пользователям
              <textarea
                className="min-h-28 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                name="description"
                placeholder="Например: подарок за технические работы"
              />
            </label>
            <PendingButton>Начислить всем</PendingButton>
            <ResultMessage state={daysState} />
          </form>
        </OperationModal>
      ) : null}

      {mounted && operation === "maintenance" ? (
        <OperationModal
          title="Технический режим"
          description="При включении пользователи увидят страницу технических работ. Войти и управлять сайтом смогут только администраторы."
          onClose={() => setOperation(null)}
        >
          <form action={maintenanceAction} className="space-y-4">
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-200">
              <input name="enabled" type="checkbox" defaultChecked={maintenanceEnabled} />
              Включить технический режим
            </label>
            <label className="grid gap-2 text-sm text-zinc-300">
              Сообщение на странице
              <textarea
                className="min-h-32 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                defaultValue={maintenanceMessage ?? ""}
                name="message"
                placeholder="Сообщите пользователям, когда сайт вернётся"
              />
            </label>
            <PendingButton>Сохранить режим</PendingButton>
            <ResultMessage state={maintenanceState} />
          </form>
        </OperationModal>
      ) : null}

      {mounted && operation === "broadcast" ? (
        <OperationModal
          title="Telegram-рассылка"
          description="Сообщение получат только пользователи, которые подтвердили привязку нажатием Start в боте."
          onClose={() => setOperation(null)}
        >
          <form action={broadcastAction} className="space-y-4" encType="multipart/form-data">
            <label className="grid gap-2 text-sm text-zinc-300">
              Текст сообщения
              <textarea
                className="min-h-40 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                maxLength={850}
                name="text"
                placeholder="Введите текст рассылки"
                required
              />
            </label>
            <label className="grid gap-2 text-sm text-zinc-300">
              Фотография, необязательно
              <input
                accept="image/*"
                className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-4 text-sm text-zinc-300"
                name="photo"
                type="file"
              />
              <span className="text-xs text-zinc-500">Поддерживаются изображения до 7 МБ.</span>
            </label>
            <PendingButton>Отправить рассылку</PendingButton>
            <ResultMessage state={broadcastState} />
          </form>
        </OperationModal>
      ) : null}
    </>
  );
}
