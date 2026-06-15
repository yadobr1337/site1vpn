import { getSettings } from "@/lib/settings";
import { PUBLIC_BILLING_MONTH_DAYS } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings();

  return Response.json(
    {
      monthlyPriceKopeks: settings.pricePerDayKopeks * PUBLIC_BILLING_MONTH_DAYS,
      trialDays: settings.trialDays,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
