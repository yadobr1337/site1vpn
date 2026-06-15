"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  adjustUserBalanceAction,
  syncUserNowAction,
  toggleBanAction,
  updateUserHwidAction,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/ui/pending-button";

type AdminUserTransaction = {
  id: string;
  label: string;
  description: string;
  amount: string;
  positive: boolean;
  createdAt: string;
};

export type AdminUserManagerData = {
  id: string;
  publicId: string;
  email: string;
  squadName: string;
  remnawaveUserUuid: string;
  subscriptionUrl: string;
  balance: string;
  remainingDays: string;
  deviceCount: number;
  hwidDeviceLimit: number | null;
  defaultHwidDeviceLimit: number;
  vpnStatus: string;
  vpnProvisionState: string;
  vpnStatusMessage: string;
  isBanned: boolean;
  transactions: AdminUserTransaction[];
};

export function UserManagerModal({ user }: { user: AdminUserManagerData }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closeModal() {
    setOpen(false);
    router.replace("/admin");
  }

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        aria-label="Закрыть управление пользователем"
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={closeModal}
      />

      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,20,29,0.99),rgba(8,11,17,0.99))] shadow-[0_28px_120px_rgba(0,0,0,0.65)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <Badge>Управление пользователем</Badge>
            <h2 className="mt-3 font-mono text-2xl font-bold text-white sm:text-3xl">
              ID: {user.publicId}
            </h2>
            <p className="mt-1 truncate text-sm text-zinc-400">{user.email}</p>
          </div>
          <Button type="button" variant="ghost" className="shrink-0" onClick={closeModal}>
            Закрыть
          </Button>
        </div>

        <div className="grid flex-1 gap-5 overflow-y-auto px-4 py-5 sm:px-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCard label="Баланс" value={user.balance} />
              <InfoCard label="Остаток" value={`${user.remainingDays} дн.`} />
              <InfoCard label="Устройства" value={String(user.deviceCount)} />
              <InfoCard label="Статус VPN" value={user.vpnStatus} />
            </div>

            <div
              className={`rounded-3xl border p-4 ${
                user.vpnProvisionState === "ERROR"
                  ? "border-red-400/25 bg-red-500/10"
                  : "border-white/10 bg-white/[0.04]"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Диагностика выдачи
              </p>
              <p className="mt-2 break-words text-sm leading-6 text-zinc-200">
                {user.vpnStatusMessage}
              </p>
              <form action={syncUserNowAction} className="mt-4">
                <input type="hidden" name="userId" value={user.id} />
                <PendingButton>Повторить выдачу</PendingButton>
              </form>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Remnawave
              </p>
              <p className="mt-3 break-all text-zinc-300">Сквад: {user.squadName}</p>
              <p className="mt-2 break-all text-zinc-400">UUID: {user.remnawaveUserUuid}</p>
              <p className="mt-2 break-all text-cyan-200">{user.subscriptionUrl}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Лимит устройств
                </p>
                <form action={updateUserHwidAction} className="mt-4 flex gap-3">
                  <input type="hidden" name="userId" value={user.id} />
                  <input
                    className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                    defaultValue={user.hwidDeviceLimit ?? ""}
                    min="1"
                    name="hwidDeviceLimit"
                    placeholder={`По умолчанию: ${user.defaultHwidDeviceLimit}`}
                    type="number"
                  />
                  <PendingButton variant="ghost">Сохранить</PendingButton>
                </form>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Доступ
                </p>
                <form action={toggleBanAction} className="mt-4">
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="ban" value={String(!user.isBanned)} />
                  <PendingButton variant={user.isBanned ? "ghost" : "danger"}>
                    {user.isBanned ? "Разбанить пользователя" : "Забанить пользователя"}
                  </PendingButton>
                </form>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Изменить баланс
              </p>
              <form action={adjustUserBalanceAction} className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_auto]">
                <input type="hidden" name="userId" value={user.id} />
                <input
                  className="h-11 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                  defaultValue="100"
                  name="amount"
                  step="1"
                  type="number"
                />
                <input
                  className="h-11 rounded-2xl border border-white/10 bg-black/30 px-4 text-white"
                  defaultValue="Ручное изменение из админки"
                  name="description"
                  type="text"
                />
                <PendingButton variant="ghost">Применить</PendingButton>
              </form>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  История операций
                </p>
                <span className="text-xs text-zinc-500">{user.transactions.length} записей</span>
              </div>
              <div className="mt-4 max-h-[34dvh] space-y-3 overflow-y-auto pr-1">
                {user.transactions.length ? (
                  user.transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{transaction.label}</p>
                        <p className="truncate text-xs text-zinc-500">{transaction.description}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={transaction.positive ? "text-sm text-cyan-200" : "text-sm text-zinc-200"}>
                          {transaction.positive ? "+" : ""}
                          {transaction.amount}
                        </p>
                        <p className="text-xs text-zinc-500">{transaction.createdAt}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-400">Операций пока нет.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
