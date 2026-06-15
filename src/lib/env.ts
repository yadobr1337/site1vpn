import "server-only";
import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalEnv = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyStringToUndefined, schema.optional());

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_URL: optionalEnv(z.string().url()),
  NEXTAUTH_SECRET: z.string().min(16),
  ADMIN_EMAIL: optionalEnv(z.string().email()),
  ADMIN_PASSWORD: optionalEnv(z.string().min(8)),
  TURNSTILE_SECRET_KEY: optionalEnv(z.string()),
  TELEGRAM_BOT_TOKEN: optionalEnv(z.string()),
  REMNAWAVE_BASE_URL: optionalEnv(z.string().url()),
  REMNAWAVE_API_TOKEN: optionalEnv(z.string()),
  REMNAWAVE_DEFAULT_INBOUND_UUIDS: optionalEnv(z.string()),
  CRON_SECRET: optionalEnv(z.string().min(16)),
  PAYMENTS_AUTO_APPROVE: optionalEnv(z.enum(["true", "false"])),
  SITE_RESTART_REQUEST_PATH: optionalEnv(z.string().min(1)),
  SMTP_HOST: optionalEnv(z.string()),
  SMTP_PORT: optionalEnv(z.coerce.number().int().positive()),
  SMTP_SECURE: optionalEnv(z.enum(["true", "false"])),
  SMTP_USER: optionalEnv(z.string()),
  SMTP_PASS: optionalEnv(z.string()),
  SMTP_FROM_EMAIL: optionalEnv(z.string().email()),
  SMTP_FROM_NAME: optionalEnv(z.string()),
  SUPPORT_EMAIL: optionalEnv(z.string().email()),
  NEXT_PUBLIC_OFFER_URL: optionalEnv(z.string().url()),
  NEXT_PUBLIC_PRIVACY_URL: optionalEnv(z.string().url()),
  NEXT_PUBLIC_SUPPORT_TELEGRAM_URL: optionalEnv(z.string().url()),
});

export const env = serverSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  REMNAWAVE_BASE_URL: process.env.REMNAWAVE_BASE_URL,
  REMNAWAVE_API_TOKEN: process.env.REMNAWAVE_API_TOKEN,
  REMNAWAVE_DEFAULT_INBOUND_UUIDS: process.env.REMNAWAVE_DEFAULT_INBOUND_UUIDS,
  CRON_SECRET: process.env.CRON_SECRET,
  PAYMENTS_AUTO_APPROVE: process.env.PAYMENTS_AUTO_APPROVE,
  SITE_RESTART_REQUEST_PATH: process.env.SITE_RESTART_REQUEST_PATH,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL,
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME,
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
  NEXT_PUBLIC_OFFER_URL: process.env.NEXT_PUBLIC_OFFER_URL,
  NEXT_PUBLIC_PRIVACY_URL: process.env.NEXT_PUBLIC_PRIVACY_URL,
  NEXT_PUBLIC_SUPPORT_TELEGRAM_URL: process.env.NEXT_PUBLIC_SUPPORT_TELEGRAM_URL,
});
