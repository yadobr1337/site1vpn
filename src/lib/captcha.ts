import { env } from "@/lib/env";

export async function verifyCaptchaToken(token?: string | null) {
  if (!token || !env.HCAPTCHA_SECRET_KEY) {
    return process.env.NODE_ENV !== "production";
  }

  const body = new URLSearchParams({
    secret: env.HCAPTCHA_SECRET_KEY,
    response: token,
  });
  if (env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY) {
    body.set("sitekey", env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY);
  }

  const response = await fetch("https://api.hcaptcha.com/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    return false;
  }

  const data = (await response.json()) as { success?: boolean };
  return Boolean(data.success);
}
