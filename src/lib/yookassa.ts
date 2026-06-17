import "server-only";

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { topUpBalance } from "@/lib/billing";

export type YooKassaPaymentMethod = "bank_card" | "sbp";

type YooKassaPayment = {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  amount: {
    value: string;
    currency: string;
  };
  confirmation?: {
    type: string;
    confirmation_url?: string;
  };
  metadata?: {
    localPaymentId?: string;
    userId?: string;
  };
};

function isConfigured() {
  return Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);
}

function getAuthHeader() {
  if (!env.YOOKASSA_SHOP_ID || !env.YOOKASSA_SECRET_KEY) {
    throw new Error("YooKassa is not configured.");
  }

  return `Basic ${Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString("base64")}`;
}

function getReturnUrl() {
  return env.YOOKASSA_RETURN_URL ?? `${env.NEXTAUTH_URL?.replace(/\/+$/, "") ?? ""}/dashboard`;
}

function kopeksToRubles(amountKopeks: number) {
  return (amountKopeks / 100).toFixed(2);
}

function rublesToKopeks(value: string) {
  return Math.round(Number(value) * 100);
}

async function requestYooKassa<T>(path: string, init?: RequestInit) {
  const response = await fetch(`https://api.yookassa.ru/v3${path}`, {
    ...init,
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YooKassa request failed: ${response.status} ${body.slice(0, 500)}`);
  }

  return (await response.json()) as T;
}

export function canUseYooKassa() {
  return isConfigured();
}

export async function createYooKassaPayment(params: {
  userId: string;
  amountKopeks: number;
  method: YooKassaPaymentMethod;
}) {
  if (!isConfigured()) {
    throw new Error("YooKassa is not configured.");
  }

  if (params.amountKopeks < 1_000) {
    throw new Error("Payment amount is too small.");
  }

  const localPayment = await db.payment.create({
    data: {
      userId: params.userId,
      method: params.method,
      amountKopeks: params.amountKopeks,
      description: `YooKassa ${params.method === "sbp" ? "SBP" : "card"} top-up`,
    },
  });

  const payment = await requestYooKassa<YooKassaPayment>("/payments", {
    method: "POST",
    headers: {
      "Idempotence-Key": localPayment.id,
    },
    body: JSON.stringify({
      amount: {
        value: kopeksToRubles(params.amountKopeks),
        currency: "RUB",
      },
      capture: true,
      payment_method_data: {
        type: params.method,
      },
      confirmation: {
        type: "redirect",
        return_url: getReturnUrl(),
      },
      description: `1VPN: пополнение баланса на ${kopeksToRubles(params.amountKopeks)} RUB`,
      metadata: {
        localPaymentId: localPayment.id,
        userId: params.userId,
      },
    }),
  });

  await db.payment.update({
    where: { id: localPayment.id },
    data: {
      providerPaymentId: payment.id,
      status: payment.status.toUpperCase(),
      confirmationUrl: payment.confirmation?.confirmation_url ?? null,
      providerPayload: payment,
    },
  });

  if (!payment.confirmation?.confirmation_url) {
    throw new Error("YooKassa did not return a confirmation URL.");
  }

  return payment.confirmation.confirmation_url;
}

export async function fetchYooKassaPayment(paymentId: string) {
  return requestYooKassa<YooKassaPayment>(`/payments/${paymentId}`);
}

export async function applyYooKassaPayment(payment: YooKassaPayment) {
  const paymentLookup = payment.metadata?.localPaymentId
    ? {
        OR: [
          { providerPaymentId: payment.id },
          { id: payment.metadata.localPaymentId },
        ],
      }
    : { providerPaymentId: payment.id };

  const localPayment = await db.payment.findFirst({
    where: paymentLookup,
  });

  if (!localPayment) {
    throw new Error(`Local payment not found for YooKassa payment ${payment.id}.`);
  }

  const amountKopeks = rublesToKopeks(payment.amount.value);
  if (amountKopeks !== localPayment.amountKopeks || payment.amount.currency !== "RUB") {
    throw new Error(`YooKassa payment amount mismatch for ${payment.id}.`);
  }

  if (payment.status === "canceled") {
    await db.payment.update({
      where: { id: localPayment.id },
      data: {
        providerPaymentId: payment.id,
        status: "CANCELED",
        providerPayload: payment,
      },
    });
    return { credited: false };
  }

  if (payment.status !== "succeeded" || !payment.paid) {
    await db.payment.update({
      where: { id: localPayment.id },
      data: {
        providerPaymentId: payment.id,
        status: payment.status.toUpperCase(),
        providerPayload: payment,
      },
    });
    return { credited: false };
  }

  const claimed = await db.payment.updateMany({
    where: {
      id: localPayment.id,
      creditedAt: null,
    },
    data: {
      providerPaymentId: payment.id,
      status: "SUCCEEDED",
      providerPayload: payment,
      creditedAt: new Date(),
    },
  });

  if (!claimed.count) {
    return { credited: false };
  }

  await topUpBalance({
    userId: localPayment.userId,
    amountKopeks: localPayment.amountKopeks,
    description: `YooKassa payment ${payment.id}`,
  });

  return { credited: true };
}

export function timingSafeEqual(value: string, expected: string) {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
