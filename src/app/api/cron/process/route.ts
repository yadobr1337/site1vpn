import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runLifecycleSweep } from "@/lib/billing";

export async function POST() {
  const headerStore = await headers();
  const authorization = headerStore.get("authorization");

  if (env.CRON_SECRET && authorization !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await runLifecycleSweep();
  return NextResponse.json({ ok: true, processedAt: new Date().toISOString() });
}
