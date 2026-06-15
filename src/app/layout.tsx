import type { Metadata } from "next";
import "./globals.css";
import { PlanetNetworkBackground } from "@/components/planet-network-background";
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
        <PlanetNetworkBackground />
        <TelegramMiniAutoAuth />
        {children}
      </body>
    </html>
  );
}
