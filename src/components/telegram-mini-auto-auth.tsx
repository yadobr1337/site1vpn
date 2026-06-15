"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

const STORAGE_KEY = "telegram-mini-auto-auth";

export function TelegramMiniAutoAuth() {
  const pathname = usePathname();

  useEffect(() => {
    const run = async () => {
      const webApp = window.Telegram?.WebApp;
      const initData = webApp?.initData?.trim();

      if (!initData) return;

      const alreadyTried = sessionStorage.getItem(STORAGE_KEY) === initData;
      const hasSessionCookie =
        document.cookie.includes("next-auth.session-token=") ||
        document.cookie.includes("__Secure-next-auth.session-token=");

      webApp?.ready?.();
      webApp?.expand?.();

      if (alreadyTried || hasSessionCookie) return;

      sessionStorage.setItem(STORAGE_KEY, initData);

      const callbackUrl =
        pathname === "/login" || pathname === "/register" ? "/dashboard" : window.location.href;

      const result = await signIn("telegram-mini", {
        initData,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }

      window.location.href = callbackUrl;
    };

    const scriptId = "telegram-web-app-script";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (window.Telegram?.WebApp) {
      void run();
      return;
    }

    if (existing) {
      existing.addEventListener("load", () => void run(), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.addEventListener("load", () => void run(), { once: true });
    document.head.appendChild(script);
  }, [pathname]);

  return null;
}
