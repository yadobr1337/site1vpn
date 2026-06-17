import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  applyYooKassaPayment,
  fetchYooKassaPayment,
  timingSafeEqual,
} from "@/lib/yookassa";

type YooKassaWebhookPayload = {
  type?: string;
  event?: string;
  object?: {
    id?: string;
  };
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (
    env.YOOKASSA_WEBHOOK_SECRET &&
    (!secret || !timingSafeEqual(secret, env.YOOKASSA_WEBHOOK_SECRET))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as YooKassaWebhookPayload;
  const paymentId = payload.object?.id;

  if (!paymentId) {
    return NextResponse.json({ ok: true });
  }

  try {
    const payment = await fetchYooKassaPayment(paymentId);
    await applyYooKassaPayment(payment);
  } catch (error) {
    console.error("[yookassa] webhook processing failed", error);
    return NextResponse.json({ error: "Payment processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
