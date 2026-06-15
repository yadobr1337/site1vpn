import cron from "node-cron";
import { runLifecycleSweep } from "@/lib/billing";

const globalJobs = globalThis as typeof globalThis & {
  __oneVpnCronStarted?: boolean;
};

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge" || globalJobs.__oneVpnCronStarted) {
    return;
  }

  globalJobs.__oneVpnCronStarted = true;
  cron.schedule("*/10 * * * *", async () => {
    try {
      await runLifecycleSweep();
    } catch (error) {
      console.error("[cron] lifecycle sweep failed", error);
    }
  });
}
