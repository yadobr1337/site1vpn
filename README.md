# 1VPN

Website and customer dashboard for the 1VPN service, built with Next.js 16,
NextAuth, Prisma, and SQLite.

## Local development

```bash
cp .env.example .env
npm ci
npm run prisma:push
npm run prisma:seed
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run lint
npm run build
```

## Production

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Ubuntu, Nginx, HTTPS, and update
instructions for `the1vpn.ru`.
