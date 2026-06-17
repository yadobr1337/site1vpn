import "server-only";

import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { env } from "@/lib/env";

type SmtpFamily = 4 | 6 | undefined;

function isMailerConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM_EMAIL);
}

function getConfiguredFamily(): SmtpFamily {
  if (!env.SMTP_IP_FAMILY || env.SMTP_IP_FAMILY === "auto") {
    return undefined;
  }

  return Number(env.SMTP_IP_FAMILY) as 4 | 6;
}

function getFamilyAttempts(): SmtpFamily[] {
  const configuredFamily = getConfiguredFamily();
  if (configuredFamily) {
    return [configuredFamily];
  }

  if (env.SMTP_CONNECT_HOST) {
    return [undefined];
  }

  if (env.SMTP_HOST?.includes("yandex.")) {
    return [6, undefined, 4];
  }

  return [undefined, 6, 4];
}

function getSmtpErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: "Unknown SMTP error" };
  }

  const details = error as Error & {
    code?: string;
    command?: string;
    response?: string;
    responseCode?: number;
  };

  return {
    code: details.code,
    command: details.command,
    responseCode: details.responseCode,
    response: details.response,
    message: details.message,
  };
}

function getTransport(family: SmtpFamily) {
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
    family: family ?? "auto",
  });

  const options: SMTPTransport.Options & { family?: 4 | 6 } = {
    host: env.SMTP_CONNECT_HOST ?? env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    family: family as 4 | 6 | undefined,
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
  let lastError: unknown = null;

  for (const family of getFamilyAttempts()) {
    const transport = getTransport(family);

    try {
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
      return;
    } catch (error) {
      lastError = error;
      console.error("[smtp] delivery attempt failed", {
        family: family ?? "auto",
        ...getSmtpErrorDetails(error),
      });
    } finally {
      transport.close();
    }
  }

  throw lastError ?? new Error("SMTP delivery failed.");
}

export function canSendEmail() {
  return isMailerConfigured();
}
