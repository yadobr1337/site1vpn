import "server-only";

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { canSendEmail, sendEmail } from "@/lib/mailer";

const CODE_TTL_MS = 10 * 60 * 1000;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

async function saveCode(identifier: string, code: string) {
  await db.verificationToken.deleteMany({
    where: { identifier },
  });

  await db.verificationToken.create({
    data: {
      identifier,
      token: hashCode(code),
      expires: new Date(Date.now() + CODE_TTL_MS),
    },
  });
}

export async function consumeEmailCode(identifier: string, code: string) {
  const token = await db.verificationToken.findFirst({
    where: {
      identifier,
      token: hashCode(code.trim()),
      expires: {
        gt: new Date(),
      },
    },
  });

  if (!token) {
    return false;
  }

  await db.verificationToken.delete({
    where: {
      token: token.token,
    },
  });

  return true;
}

export async function issueEmailCode(params: {
  identifier: string;
  email: string;
  subject: string;
  title: string;
  description: string;
}) {
  if (!canSendEmail()) {
    throw new Error("SMTP is not configured.");
  }

  const code = generateCode();
  const emailValue = normalizeEmail(params.email);

  await saveCode(params.identifier, code);

  await sendEmail({
    to: emailValue,
    subject: params.subject,
    text: `${params.title}\n\n${params.description}\n\nКод: ${code}\nКод действует 10 минут.`,
    html: `
      <div style="background:#070b12;padding:32px;font-family:Arial,sans-serif;color:#f4f7fb">
        <div style="max-width:520px;margin:0 auto;background:#0d111a;border:1px solid rgba(93,214,255,0.2);border-radius:24px;padding:32px">
          <div style="font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#7ddcff">1VPN</div>
          <h1 style="margin:16px 0 12px;font-size:28px;line-height:1.1">${params.title}</h1>
          <p style="margin:0 0 24px;color:#b2bfd1;line-height:1.7">${params.description}</p>
          <div style="font-size:42px;font-weight:800;letter-spacing:0.2em;color:#ffffff;background:linear-gradient(135deg,rgba(93,214,255,0.16),rgba(255,255,255,0.04));border:1px solid rgba(93,214,255,0.3);border-radius:20px;padding:18px 24px;text-align:center">
            ${code}
          </div>
          <p style="margin:24px 0 0;color:#7d8ba2;line-height:1.7">Код действует 10 минут. Если это были не вы, просто игнорируйте письмо.</p>
        </div>
      </div>
    `,
  });
}

export function buildLoginCodeIdentifier(email: string) {
  return `login:${normalizeEmail(email)}`;
}

export function buildPasswordResetIdentifier(email: string) {
  return `reset-password:${normalizeEmail(email)}`;
}

export function buildEmailVerificationIdentifier(userId: string, email: string) {
  return `verify-email:${userId}:${normalizeEmail(email)}`;
}
