import type { Metadata } from "next";
import "./globals.css";
import { TelegramMiniAutoAuth } from "@/components/telegram-mini-auto-auth";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <TelegramMiniAutoAuth />
        {children}
      </body>
    </html>
  );
}
