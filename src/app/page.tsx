import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";
import { ScrollReveal } from "@/components/scroll-reveal";
import { getAuthSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { siteConfig } from "@/lib/site";
import { formatCurrency } from "@/lib/utils";

const features = [
  {
    title: "Молниеносная скорость",
    text: "Смотри, играй и загружай без лагов. Оптимизированные сервера держат высокий темп без лишней нагрузки.",
    className: "feature-card feature-speed",
    visual: (
      <div className="feature-speed-visual" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    ),
  },
  {
    title: "Безопасный доступ",
    text: "Подключился и сразу работаешь в защищенном туннеле. Шифрование включается без ручной настройки.",
    className: "feature-card feature-lock",
    visual: (
      <div className="feature-lock-visual" aria-hidden>
        <div className="feature-lock-shackle" />
        <div className="feature-lock-body" />
      </div>
    ),
  },
  {
    title: "Интернет без границ",
    text: "Сервисы, сайты и приложения открываются так, как будто ты уже находишься в нужной стране.",
    className: "feature-card feature-globe",
    visual: (
      <div className="feature-globe-visual" aria-hidden>
        <div className="feature-globe-core" />
        <div className="feature-globe-ring feature-globe-ring-one" />
        <div className="feature-globe-ring feature-globe-ring-two" />
      </div>
    ),
  },
  {
    title: "Умное подключение",
    text: "Система выбирает лучший сервер для стабильного соединения и аккуратно держит качество канала.",
    className: "feature-card feature-smart",
    visual: (
      <div className="feature-smart-visual" aria-hidden>
        <span className="feature-smart-dot" />
        <span className="feature-smart-dot" />
        <span className="feature-smart-dot" />
      </div>
    ),
  },
  {
    title: "Полная приватность",
    text: "Без логов и лишнего шума. Только твой трафик, закрытый канал и аккуратный личный кабинет.",
    className: "feature-card feature-privacy",
    visual: (
      <div className="feature-privacy-visual" aria-hidden>
        <span />
      </div>
    ),
  },
];

export default async function HomePage() {
  const [session, settings] = await Promise.all([getAuthSession(), getSettings()]);
  const supportTelegramUrl = env.NEXT_PUBLIC_SUPPORT_TELEGRAM_URL ?? settings.supportTelegramUrl ?? null;
  const monthlyPriceKopeks = settings.pricePerDayKopeks * 30;

  return (
    <main className="grid-overlay overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-3 py-3 sm:px-6 sm:py-5 lg:px-10">
        <ScrollReveal>
          <header className="flex items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl sm:px-5 sm:py-4">
            <Link href="/" className="min-w-0">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <span
                  className="glitch shrink-0 text-[1.75rem] font-black tracking-[0.16em] text-white sm:text-[2rem] sm:tracking-[0.24em]"
                  data-text="1VPN"
                >
                  1VPN
                </span>
                <span className="hidden text-[11px] uppercase tracking-[0.28em] text-zinc-500 md:block">
                  {siteConfig.tagline}
                </span>
              </div>
            </Link>

            <div className="flex max-w-[66%] flex-wrap justify-end gap-2">
              {session?.user ? (
                <>
                  <Link href="/dashboard">
                    <Button size="sm" className="px-3 sm:px-4">
                      Кабинет
                    </Button>
                  </Link>
                  <div className="scale-90 origin-right sm:scale-100">
                    <LogoutButton />
                  </div>
                </>
              ) : (
                <>
                  <Link href="/login">
                    <Button variant="ghost" size="sm" className="px-3 sm:px-4">
                      Войти
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button size="sm" className="px-3 sm:px-4">
                      Создать аккаунт
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </header>
        </ScrollReveal>

        <section className="relative grid flex-1 items-center gap-6 py-6 sm:gap-10 sm:py-10 lg:grid-cols-[1.02fr_0.98fr] lg:py-16">
          <div className="order-1 space-y-5 sm:space-y-7">
            <div className="space-y-3 sm:space-y-4">
              <ScrollReveal>
                <Badge className="px-3 py-1 text-[10px] tracking-[0.28em] sm:text-xs">
                  Dark neon / tech panel
                </Badge>
              </ScrollReveal>
              <ScrollReveal delay={1}>
                <h1 className="max-w-4xl text-[clamp(2.65rem,11vw,5.4rem)] font-black uppercase leading-[0.88] tracking-[0.05em] sm:tracking-[0.08em]">
                  <span className="bg-[linear-gradient(180deg,#f5f9ff_0%,#deebf8_38%,#8edfff_72%,#5ea8ff_100%)] bg-clip-text text-transparent">
                    Безопасный доступ в пару тапов
                  </span>
                </h1>
              </ScrollReveal>
              <ScrollReveal delay={2}>
                <p className="max-w-2xl text-[15px] leading-7 text-zinc-300 sm:text-lg sm:leading-8">
                  Подключение за минуту, гибкий баланс вместо тарифов и управление устройствами из
                  одного кабинета без перегруженного интерфейса.
                </p>
              </ScrollReveal>
            </div>

            <ScrollReveal delay={3}>
              <div className="flex flex-wrap gap-2.5 sm:gap-3">
                {session?.user ? (
                  <Link href="/dashboard">
                    <Button size="sm" className="h-10 px-4 sm:h-12 sm:px-6">
                      Открыть кабинет
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Link href="/register">
                      <Button size="sm" className="h-10 px-4 sm:h-12 sm:px-6">
                        Регистрация
                      </Button>
                    </Link>
                    <Link href="/login">
                      <Button variant="ghost" size="sm" className="h-10 px-4 sm:h-12 sm:px-6">
                        Войти
                      </Button>
                    </Link>
                  </>
                )}
                {supportTelegramUrl ? (
                  <Link href={supportTelegramUrl} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="sm" className="h-10 px-4 sm:h-12 sm:px-6">
                      Поддержка
                    </Button>
                  </Link>
                ) : null}
              </div>
            </ScrollReveal>

            <ScrollReveal>
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                <Card className="hero-glow rounded-[24px] p-4 sm:rounded-[28px] sm:p-6">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500 sm:text-xs sm:tracking-[0.3em]">
                    Цена за месяц
                  </p>
                  <p className="mt-2.5 text-[2rem] font-bold leading-none text-white sm:mt-3 sm:text-3xl">
                    {formatCurrency(monthlyPriceKopeks)}
                  </p>
                </Card>
                <Card className="rounded-[24px] p-4 sm:rounded-[28px] sm:p-6">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500 sm:text-xs sm:tracking-[0.3em]">
                    Пробный период
                  </p>
                  <p className="mt-2.5 text-[2rem] font-bold leading-none text-white sm:mt-3 sm:text-3xl">
                    {settings.trialDays} день
                  </p>
                </Card>
              </div>
            </ScrollReveal>
          </div>

          <div className="order-2">
            <ScrollReveal delay={1}>
              <div className="hero-glow mx-auto max-w-[440px] sm:max-w-[560px]">
                <Card className="overflow-hidden rounded-[28px] p-0 sm:rounded-[32px]">
                  <div className="border-b border-white/10 bg-[linear-gradient(90deg,rgba(93,214,255,0.1),transparent)] px-4 py-3 sm:px-6 sm:py-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-400 sm:text-xs sm:tracking-[0.28em]">
                      live preview / protected tunnel
                    </p>
                  </div>
                  <div className="relative p-4 sm:p-6">
                    <Image
                      src="/logo-main.png"
                      alt="1VPN logo"
                      width={1280}
                      height={720}
                      className="rounded-[18px] opacity-90 sm:rounded-[24px]"
                      priority
                    />
                    <div className="pointer-events-none absolute inset-4 rounded-[18px] border border-white/10 sm:inset-6 sm:rounded-[24px]" />
                  </div>
                </Card>
              </div>
            </ScrollReveal>
          </div>
        </section>

        <section className="pb-6 sm:pb-8">
          <ScrollReveal>
            <div className="mb-4 flex items-end justify-between gap-4 sm:mb-5">
              <div>
                <Badge className="px-3 py-1 text-[10px] tracking-[0.28em] sm:text-xs">Преимущества</Badge>
                <h2 className="mt-2.5 text-2xl font-bold uppercase tracking-[0.05em] text-white sm:mt-3 sm:text-3xl sm:tracking-[0.08em]">
                  Почему это удобно
                </h2>
              </div>
            </div>
          </ScrollReveal>

          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-5">
            {features.map((feature, index) => (
              <ScrollReveal key={feature.title} delay={((index % 3) + 1) as 1 | 2 | 3}>
                <Card className={`${feature.className} card-lift rounded-[24px] p-4 sm:rounded-[28px] sm:p-6`}>
                  <div className="feature-visual">{feature.visual}</div>
                  <h3 className="mt-4 text-base font-semibold text-white sm:mt-6 sm:text-lg">
                    {feature.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-6 text-zinc-400 sm:mt-3 sm:leading-7">
                    {feature.text}
                  </p>
                </Card>
              </ScrollReveal>
            ))}
          </div>
        </section>

        <section className="pb-8 sm:pb-10">
          <ScrollReveal>
            <Card className="space-y-4 rounded-[26px] p-4 sm:space-y-5 sm:rounded-[28px] sm:p-6">
              <Badge className="px-3 py-1 text-[10px] tracking-[0.28em] sm:text-xs">
                Документы и поддержка
              </Badge>
              <h2 className="text-xl font-bold uppercase tracking-[0.05em] text-white sm:text-2xl sm:tracking-[0.08em]">
                Все нужные ссылки под рукой
              </h2>
              <div className="flex flex-wrap gap-2.5 sm:gap-3">
                {env.NEXT_PUBLIC_OFFER_URL ? (
                  <Link href={env.NEXT_PUBLIC_OFFER_URL} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="sm" className="px-4">
                      Оферта
                    </Button>
                  </Link>
                ) : null}
                {env.NEXT_PUBLIC_PRIVACY_URL ? (
                  <Link href={env.NEXT_PUBLIC_PRIVACY_URL} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="sm" className="px-4">
                      Политика конфиденциальности
                    </Button>
                  </Link>
                ) : null}
                {supportTelegramUrl ? (
                  <Link href={supportTelegramUrl} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="sm" className="px-4">
                      Telegram
                    </Button>
                  </Link>
                ) : null}
                {env.SUPPORT_EMAIL ? (
                  <Link href={`mailto:${env.SUPPORT_EMAIL}`}>
                    <Button variant="ghost" size="sm" className="px-4">
                      {env.SUPPORT_EMAIL}
                    </Button>
                  </Link>
                ) : null}
              </div>
            </Card>
          </ScrollReveal>
        </section>
      </div>
    </main>
  );
}
