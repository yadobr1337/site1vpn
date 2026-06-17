"use client";

import { useEffect, useRef } from "react";
import { publicEnv } from "@/lib/public-env";

declare global {
  interface Window {
    hcaptcha?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => string;
      reset?: (widgetId?: string) => void;
    };
  }
}

export const isCaptchaConfigured = Boolean(publicEnv.NEXT_PUBLIC_HCAPTCHA_SITE_KEY);

type HCaptchaWidgetProps = {
  enabled: boolean;
  onVerify: (token: string) => void;
  onReset?: () => void;
};

export function HCaptchaWidget({ enabled, onVerify, onReset }: HCaptchaWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !publicEnv.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || !containerRef.current) {
      return;
    }

    const renderWidget = () => {
      if (!containerRef.current || widgetIdRef.current) {
        return;
      }

      widgetIdRef.current =
        window.hcaptcha?.render(containerRef.current, {
          sitekey: publicEnv.NEXT_PUBLIC_HCAPTCHA_SITE_KEY!,
          callback: onVerify,
          "expired-callback": () => {
            onReset?.();
            window.hcaptcha?.reset?.(widgetIdRef.current ?? undefined);
          },
          "error-callback": () => {
            onReset?.();
          },
        }) ?? null;
    };

    if (window.hcaptcha) {
      renderWidget();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src^="https://js.hcaptcha.com/1/api.js"]',
    );

    if (existingScript) {
      existingScript.addEventListener("load", renderWidget, { once: true });
      return () => existingScript.removeEventListener("load", renderWidget);
    }

    const script = document.createElement("script");
    script.src = "https://js.hcaptcha.com/1/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", renderWidget, { once: true });
    document.body.appendChild(script);

    return () => script.removeEventListener("load", renderWidget);
  }, [enabled, onReset, onVerify]);

  if (!enabled) {
    return (
      <p className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-400">
        CAPTCHA отключена в админке.
      </p>
    );
  }

  if (!publicEnv.NEXT_PUBLIC_HCAPTCHA_SITE_KEY) {
    return (
      <p className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-400">
        CAPTCHA отключена, пока не заполнен `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div ref={containerRef} />
    </div>
  );
}
