"use client";

import { useState } from "react";
import { PendingButton } from "@/components/ui/pending-button";

type DeviceStepperFormProps = {
  action: (formData: FormData) => Promise<void>;
  currentValue: number;
};

export function DeviceStepperForm({ action, currentValue }: DeviceStepperFormProps) {
  const [value, setValue] = useState(currentValue);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="hwidDeviceLimit" value={String(value)} />
      <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-black/30 p-2">
        <button
          type="button"
          onClick={() => setValue((previous) => Math.max(1, previous - 1))}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl text-white transition hover:bg-white/10"
          aria-label="Уменьшить количество устройств"
        >
          -
        </button>
        <span className="min-w-12 text-center text-2xl font-bold text-white">{value}</span>
        <button
          type="button"
          onClick={() => setValue((previous) => previous + 1)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl text-white transition hover:bg-white/10"
          aria-label="Увеличить количество устройств"
        >
          +
        </button>
      </div>
      <PendingButton variant="ghost">Сохранить устройства</PendingButton>
    </form>
  );
}
