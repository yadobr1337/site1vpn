import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RegisterForm } from "@/components/auth/register-form";
import { TelegramLogin } from "@/components/auth/telegram-login";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MaintenanceScreen } from "@/components/maintenance-screen";
import { getAuthSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export default async function RegisterPage() {
  const [session, settings] = await Promise.all([getAuthSession(), getSettings()]);
  if (session?.user) {
    redirect("/dashboard");
  }

  if (settings.maintenanceEnabled) {
    return <MaintenanceScreen message={settings.maintenanceMessage} />;
  }

  return (
    <main className="dashboard-shell flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
      <Card className="mx-auto w-full max-w-xl">
        <div className="flex items-center justify-between gap-4">
          <Badge>Register</Badge>
          <Link href="/">
            <Button variant="ghost" type="button">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Назад
            </Button>
          </Link>
        </div>

        <h1 className="mt-6 text-3xl font-bold uppercase tracking-[0.08em] text-white">
          Создать аккаунт
        </h1>
        <p className="mt-3 text-sm leading-7 text-zinc-400">
          После регистрации отправим код подтверждения на email.
        </p>

        <div className="mt-8">
          <RegisterForm captchaEnabled={settings.captchaEnabled} />
        </div>

        <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-zinc-500">
          <span className="h-px flex-1 bg-white/10" />
          Telegram
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <TelegramLogin mode="login" />
        <p className="mt-3 text-xs leading-6 text-zinc-500">
          Для получения бесплатного дня после входа потребуется отдельно запустить бота.
        </p>
      </Card>
    </main>
  );
}
