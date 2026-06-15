"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

type PublicPricingProps = {
  initialMonthlyPriceKopeks: number;
  initialTrialDays: number;
};

type PublicSettingsResponse = {
  monthlyPriceKopeks: number;
  trialDays: number;
};

function isPublicSettingsResponse(value: unknown): value is PublicSettingsResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const settings = value as Partial<PublicSettingsResponse>;
  return (
    typeof settings.monthlyPriceKopeks === "number" &&
    Number.isFinite(settings.monthlyPriceKopeks) &&
    settings.monthlyPriceKopeks >= 0 &&
    typeof settings.trialDays === "number" &&
    Number.isFinite(settings.trialDays) &&
    settings.trialDays >= 1
  );
}

export function PublicPricing({
  initialMonthlyPriceKopeks,
  initialTrialDays,
}: PublicPricingProps) {
  const [monthlyPriceKopeks, setMonthlyPriceKopeks] = useState(initialMonthlyPriceKopeks);
  const [trialDays, setTrialDays] = useState(initialTrialDays);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/public/settings", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((settings: unknown) => {
        if (!isPublicSettingsResponse(settings)) {
          return;
        }

        setMonthlyPriceKopeks(settings.monthlyPriceKopeks);
        setTrialDays(settings.trialDays);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      <Card className="hero-glow rounded-[24px] p-4 sm:rounded-[28px] sm:p-6">
        <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500 sm:text-xs sm:tracking-[0.3em]">
          Цена за месяц
        </p>
        <p
          aria-live="polite"
          className="mt-2.5 text-[2rem] font-bold leading-none text-white sm:mt-3 sm:text-3xl"
        >
          {formatCurrency(monthlyPriceKopeks)}
        </p>
      </Card>
      <Card className="rounded-[24px] p-4 sm:rounded-[28px] sm:p-6">
        <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500 sm:text-xs sm:tracking-[0.3em]">
          Пробный период
        </p>
        <p
          aria-live="polite"
          className="mt-2.5 text-[2rem] font-bold leading-none text-white sm:mt-3 sm:text-3xl"
        >
          {trialDays} день
        </p>
      </Card>
    </div>
  );
}
