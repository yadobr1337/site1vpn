import { env } from "@/lib/env";

type TelegramAuthPayload = {
  id: string;
  first_name: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
};

type TelegramMiniAppUser = {
  id: number;
  first_name: string;
  username?: string;
  photo_url?: string;
};

function buildDataCheckString(payload: Record<string, string | undefined>) {
  return Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

async function hmacSha256Raw(key: BufferSource, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}

function toHex(signature: ArrayBuffer) {
  return Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function isFresh(authDate: string) {
  const authAgeSeconds = Math.abs(Date.now() / 1000 - Number(authDate));
  return Number.isFinite(authAgeSeconds) && authAgeSeconds <= 86_400;
}

export async function verifyTelegramAuth(payload: TelegramAuthPayload) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: "Telegram bot token is not configured." } as const;
  }

  if (!isFresh(payload.auth_date)) {
    return { ok: false, error: "Telegram auth payload is expired." } as const;
  }

  const secretHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(env.TELEGRAM_BOT_TOKEN),
  );

  const signature = await hmacSha256Raw(secretHash, buildDataCheckString(payload));
  const computedHash = toHex(signature);

  if (computedHash !== payload.hash) {
    return { ok: false, error: "Telegram auth hash is invalid." } as const;
  }

  return {
    ok: true,
    data: {
      id: payload.id,
      firstName: payload.first_name,
      username: payload.username ?? null,
      photoUrl: payload.photo_url ?? null,
    },
  } as const;
}

export async function verifyTelegramMiniAppAuth(initData: string) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: "Telegram bot token is not configured." } as const;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDate = params.get("auth_date");
  const userRaw = params.get("user");

  if (!hash || !authDate || !userRaw) {
    return { ok: false, error: "Telegram Mini App payload is incomplete." } as const;
  }

  if (!isFresh(authDate)) {
    return { ok: false, error: "Telegram Mini App payload is expired." } as const;
  }

  const entries = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmacSha256Raw(
    new TextEncoder().encode("WebAppData"),
    env.TELEGRAM_BOT_TOKEN,
  );
  const signature = await hmacSha256Raw(secretKey, entries);
  const computedHash = toHex(signature);

  if (computedHash !== hash) {
    return { ok: false, error: "Telegram Mini App hash is invalid." } as const;
  }

  let user: TelegramMiniAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramMiniAppUser;
  } catch {
    return { ok: false, error: "Telegram Mini App user payload is invalid." } as const;
  }

  if (!user?.id || !user.first_name) {
    return { ok: false, error: "Telegram Mini App user payload is incomplete." } as const;
  }

  return {
    ok: true,
    data: {
      id: String(user.id),
      firstName: user.first_name,
      username: user.username ?? null,
      photoUrl: user.photo_url ?? null,
    },
  } as const;
}

export async function sendTelegramMessage(chatId: string, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: "Telegram bot token is not configured." } as const;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, error: errorText } as const;
  }

  return { ok: true } as const;
}
