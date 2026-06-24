import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runLifecycleSweep } from "@/lib/billing";
import { runProvisioningSweep } from "@/lib/provisioning";

export async function POST() {
  const headerStore = await headers();
  const authorization = headerStore.get("authorization");

  if (env.CRON_SECRET && authorization !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provisioning = await runProvisioningSweep();
  await runLifecycleSweep();
  return NextResponse.json({
    ok: provisioning.ok,
    provisioning,
    processedAt: new Date().toISOString(),
  });
}
