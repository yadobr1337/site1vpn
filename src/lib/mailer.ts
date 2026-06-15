import "server-only";

import nodemailer from "nodemailer";
import { env } from "@/lib/env";

function isMailerConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM_EMAIL);
}

function getTransport() {
  if (!isMailerConfigured()) {
    throw new Error("SMTP is not configured.");
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : undefined,
  });
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const transport = getTransport();

  await transport.sendMail({
    from: env.SMTP_FROM_NAME
      ? `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`
      : env.SMTP_FROM_EMAIL,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
}

export function canSendEmail() {
  return isMailerConfigured();
}
