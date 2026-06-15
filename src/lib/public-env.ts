import { z } from "zod";

const clientSchema = z.object({
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional(),
  TURNSTILE_SITE_KEY: z.string().optional(),
  NEXT_PUBLIC_OFFER_URL: z.string().optional(),
  NEXT_PUBLIC_PRIVACY_URL: z.string().optional(),
  NEXT_PUBLIC_SUPPORT_TELEGRAM_URL: z.string().optional(),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.string().optional(),
});

export const publicEnv = clientSchema.parse({
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
  TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_OFFER_URL: process.env.NEXT_PUBLIC_OFFER_URL,
  NEXT_PUBLIC_PRIVACY_URL: process.env.NEXT_PUBLIC_PRIVACY_URL,
  NEXT_PUBLIC_SUPPORT_TELEGRAM_URL: process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM_URL,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
});
