import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RegisterForm } from "@/components/auth/register-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAuthSession } from "@/lib/auth";

export default async function RegisterPage() {
  const session = await getAuthSession();
  if (session?.user) {
    redirect("/dashboard");
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
          <RegisterForm />
        </div>
      </Card>
    </main>
  );
}
