import "server-only";

import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { env } from "@/lib/env";

function isMailerConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM_EMAIL);
}

function getTransport() {
  if (!isMailerConfigured()) {
    throw new Error("SMTP is not configured.");
  }

  console.info("[smtp] creating transport", {
    host: env.SMTP_HOST,
    connectHost: env.SMTP_CONNECT_HOST ?? env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    user: env.SMTP_USER ? `${env.SMTP_USER.slice(0, 3)}***` : null,
    from: env.SMTP_FROM_EMAIL,
    family: 4,
  });

  const options: SMTPTransport.Options & { family: 4 } = {
    host: env.SMTP_CONNECT_HOST ?? env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    family: 4,
    name: env.SMTP_HOST,
    tls: {
      servername: env.SMTP_HOST,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : undefined,
  };

  return nodemailer.createTransport(options);
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const transport = getTransport();

  await transport.verify();
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
