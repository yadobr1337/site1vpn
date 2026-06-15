"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/ui/pending-button";

type BillingModalProps = {
  transactions: Array<{
    id: string;
    description: string;
    amount: string;
    createdAt: string;
  }>;
  topUpAction: (formData: FormData) => Promise<void>;
};

export function BillingModal({ transactions, topUpAction }: BillingModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const overlay =
    typeof document !== "undefined" && open
      ? createPortal(
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-3 sm:p-5">
            <button
              type="button"
              aria-label="Закрыть окно пополнения"
              className="absolute inset-0 bg-black/72 backdrop-blur-md"
              onClick={() => setOpen(false)}
            />

            <div className="relative z-10 flex max-h-[min(88dvh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,20,29,0.98),rgba(8,11,17,0.98))] shadow-[0_28px_120px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Billing</p>
                  <h3 className="mt-2 text-xl font-bold uppercase tracking-[0.08em] text-white sm:text-3xl">
                    Баланс и пополнения
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                    Пополнение и история платежей открываются в отдельном всплывающем окне.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  type="button"
                  className="shrink-0"
                >
                  Назад
                </Button>
              </div>

              <div className="grid flex-1 gap-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[0.92fr_1.08fr] lg:gap-6">
                <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">
                    Пополнение
                  </p>

                  <form action={topUpAction} className="mt-4 space-y-3">
                    <label className="block text-sm text-zinc-300">
                      Сумма пополнения
                      <input
                        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-white outline-none transition focus:border-cyan-300/40"
                        defaultValue="199"
                        min="10"
                        name="amount"
                        step="1"
                        type="number"
                      />
                    </label>
                    <PendingButton className="w-full">Пополнить баланс</PendingButton>
                  </form>
                </div>

                <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">
                      История пополнений
                    </p>
                    <span className="text-xs text-zinc-500">{transactions.length} записей</span>
                  </div>

                  <div className="mt-4 max-h-[44dvh] space-y-3 overflow-y-auto pr-1 sm:max-h-[52dvh]">
                    {transactions.length ? (
                      transactions.map((transaction) => (
                        <div
                          key={transaction.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {transaction.description}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">{transaction.createdAt}</p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-cyan-200">
                            +{transaction.amount}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-4 text-sm text-zinc-400">
                        Пополнений пока не было.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Button onClick={() => setOpen(true)} size="lg">
        Пополнить баланс
      </Button>
      {overlay}
    </>
  );
}
