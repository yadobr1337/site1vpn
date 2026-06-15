import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";

export function MaintenanceScreen({
  message,
  showLogin = true,
  showLogout = false,
}: {
  message?: string | null;
  showLogin?: boolean;
  showLogout?: boolean;
}) {
  return (
    <main className="dashboard-shell flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-2xl border-amber-400/25 bg-amber-500/[0.06] text-center">
        <Badge>Технические работы</Badge>
        <h1 className="mt-6 text-3xl font-bold uppercase tracking-[0.08em] text-white sm:text-4xl">
          Скоро вернёмся
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-zinc-300 sm:text-base">
          {message?.trim() ||
            "Сейчас мы обновляем 1VPN. Личный кабинет временно недоступен, ваши подписки продолжают работать."}
        </p>
        {showLogin || showLogout ? (
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {showLogout ? <LogoutButton /> : null}
            {showLogin ? (
              <Link href="/login">
                <Button variant="ghost">Вход администратора</Button>
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card>
    </main>
  );
}
