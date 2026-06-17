import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalEnv = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyStringToUndefined, schema.optional());

const clientSchema = z.object({
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: optionalEnv(z.string()),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalEnv(z.string()),
  TURNSTILE_SITE_KEY: optionalEnv(z.string()),
  NEXT_PUBLIC_OFFER_URL: optionalEnv(z.string().url()),
  NEXT_PUBLIC_PRIVACY_URL: optionalEnv(z.string().url()),
  NEXT_PUBLIC_SUPPORT_TELEGRAM_URL: optionalEnv(z.string().url()),
  NEXT_PUBLIC_SUPPORT_EMAIL: optionalEnv(z.string().email()),
});

export const publicEnv = clientSchema.parse({
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? process.env.TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_OFFER_URL: process.env.NEXT_PUBLIC_OFFER_URL,
  NEXT_PUBLIC_PRIVACY_URL: process.env.NEXT_PUBLIC_PRIVACY_URL,
  NEXT_PUBLIC_SUPPORT_TELEGRAM_URL: process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM_URL,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
});
