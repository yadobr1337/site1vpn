# Deploying 1VPN to Ubuntu

This setup runs one Next.js instance behind Nginx and stores the SQLite database
on the server at `/var/www/site1vpn/prisma/production.db`.

## 1. Point the domain to the server

At the DNS provider for `the1vpn.ru`, create these records:

- `A` record: `@` -> the public IPv4 address of the Ubuntu server
- `A` record: `www` -> the same public IPv4 address
- Optional `AAAA` records only if the server has working public IPv6

Wait until both names resolve to the server before requesting HTTPS certificates.

## 2. Install server packages

Next.js 16 requires Node.js 20.9 or newer. Install a current LTS release so that
`node` and `npm` are available at `/usr/bin/node` and `/usr/bin/npm`.

```bash
sudo apt update
sudo apt install -y git nginx curl ca-certificates snapd
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
node --version
npm --version
```

Open SSH, HTTP, and HTTPS in the firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"
sudo ufw enable
```

## 3. Clone and configure the application

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin site1vpn
sudo git clone https://github.com/yadobr1337/site1vpn.git /var/www/site1vpn
sudo chown -R site1vpn:site1vpn /var/www/site1vpn
cd /var/www/site1vpn
sudo -u site1vpn cp .env.example .env
sudo -u site1vpn nano .env
```

At minimum, replace `NEXTAUTH_SECRET`, `CRON_SECRET`, `ADMIN_PASSWORD`, and all
service tokens in `.env`. Generate secrets with:

```bash
openssl rand -base64 32
```

Keep `DATABASE_URL="file:./production.db"` and
`NEXTAUTH_URL="https://the1vpn.ru"`.

For Telegram linking and notifications, set:

```dotenv
TELEGRAM_BOT_TOKEN="token-from-BotFather"
TELEGRAM_WEBHOOK_SECRET="random-hex-secret"
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="VPNthe1_bot"
NEXT_PUBLIC_SUPPORT_TELEGRAM_URL="https://t.me/VPNthe1_bot"
```

Generate the webhook secret with `openssl rand -hex 32`. Never commit the bot
token to Git.

## 4. Install, initialize, and build

`NEXT_PUBLIC_*` values are embedded during the build, so set them in `.env`
before running this step.

```bash
cd /var/www/site1vpn
sudo -u site1vpn npm ci
sudo -u site1vpn npm run prisma:push
sudo -u site1vpn npm run prisma:seed
sudo -u site1vpn npm run build
sudo install -d -o site1vpn -g site1vpn /var/www/site1vpn/runtime
sudo -u site1vpn ./deploy/publish-static-home.sh
```

## 5. Enable the application and Nginx

```bash
sudo install -d -o site1vpn -g site1vpn /var/www/site1vpn/runtime
sudo cp deploy/site1vpn.service /etc/systemd/system/site1vpn.service
sudo cp deploy/site1vpn-restart.service /etc/systemd/system/site1vpn-restart.service
sudo cp deploy/site1vpn-restart.path /etc/systemd/system/site1vpn-restart.path
sudo cp deploy/site1vpn-restart.timer /etc/systemd/system/site1vpn-restart.timer
sudo cp deploy/site1vpn-healthcheck.service /etc/systemd/system/site1vpn-healthcheck.service
sudo cp deploy/site1vpn-healthcheck.timer /etc/systemd/system/site1vpn-healthcheck.timer
sudo cp deploy/site1vpn-recover.service /etc/systemd/system/site1vpn-recover.service
sudo install -d /etc/systemd/system/nginx.service.d
sudo cp deploy/nginx-restart.conf /etc/systemd/system/nginx.service.d/restart.conf
sudo chmod 755 deploy/site1vpn-healthcheck.sh
sudo systemctl daemon-reload
sudo systemctl enable --now site1vpn
sudo systemctl enable --now site1vpn-restart.path
sudo systemctl enable --now site1vpn-restart.timer
sudo systemctl enable --now site1vpn-healthcheck.timer

sudo cp deploy/nginx-the1vpn.ru.conf /etc/nginx/sites-available/the1vpn.ru
sudo ln -s /etc/nginx/sites-available/the1vpn.ru /etc/nginx/sites-enabled/the1vpn.ru
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Check the app before enabling HTTPS:

```bash
curl -I http://127.0.0.1:3000
curl http://127.0.0.1:3000/api/health
curl -I http://the1vpn.ru
sudo systemctl status site1vpn
```

## 6. Enable HTTPS

After DNS points to this server and port 80 is publicly reachable:

```bash
sudo certbot --nginx -d the1vpn.ru -d www.the1vpn.ru
sudo certbot renew --dry-run
```

Register the Telegram webhook after HTTPS is working:

```bash
sudo -u site1vpn bash -lc 'cd /var/www/site1vpn && set -a && source .env && set +a && curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" --data-urlencode "url=${NEXTAUTH_URL}/api/telegram/webhook" --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}"'
```

The response must contain `"ok":true`. Check the current webhook state with:

```bash
sudo -u site1vpn bash -lc 'cd /var/www/site1vpn && set -a && source .env && set +a && curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"'
```

## Updating

```bash
cd /var/www/site1vpn
sudo systemctl stop site1vpn-healthcheck.timer site1vpn
sudo -u site1vpn git pull --ff-only
sudo -u site1vpn npm ci
sudo -u site1vpn npm run prisma:push
sudo -u site1vpn npm run build
sudo install -d -o site1vpn -g site1vpn /var/www/site1vpn/runtime
sudo -u site1vpn ./deploy/publish-static-home.sh
sudo cp deploy/site1vpn.service /etc/systemd/system/site1vpn.service
sudo cp deploy/site1vpn-restart.service /etc/systemd/system/site1vpn-restart.service
sudo cp deploy/site1vpn-restart.path /etc/systemd/system/site1vpn-restart.path
sudo cp deploy/site1vpn-restart.timer /etc/systemd/system/site1vpn-restart.timer
sudo cp deploy/site1vpn-healthcheck.service /etc/systemd/system/site1vpn-healthcheck.service
sudo cp deploy/site1vpn-healthcheck.timer /etc/systemd/system/site1vpn-healthcheck.timer
sudo cp deploy/site1vpn-recover.service /etc/systemd/system/site1vpn-recover.service
sudo install -d /etc/systemd/system/nginx.service.d
sudo cp deploy/nginx-restart.conf /etc/systemd/system/nginx.service.d/restart.conf
sudo chmod 755 deploy/site1vpn-healthcheck.sh
sudo systemctl daemon-reload
sudo systemctl enable --now site1vpn-restart.path
sudo systemctl enable --now site1vpn-restart.timer
sudo systemctl enable --now site1vpn site1vpn-healthcheck.timer
```

When updating Nginx on a server where Certbot already added HTTPS settings,
do not overwrite the complete active virtual host with the HTTP-only template.
Apply the `location` changes from `deploy/nginx-the1vpn.ru.conf` to the existing
HTTPS server block, then run `sudo nginx -t && sudo systemctl reload nginx`.
The static homepage is served directly by Nginx from
`/var/www/site1vpn/runtime/public-home`; dashboard and API routes still use
Next.js.

The service intentionally avoids systemd mount-namespace hardening directives
because some VPS/container hosts reject them with `status=226/NAMESPACE`. The
application still runs as the unprivileged `site1vpn` user with
`NoNewPrivileges=true`.

## Logs and backups

```bash
sudo journalctl -u site1vpn -f
sudo journalctl -u site1vpn-healthcheck.service -u site1vpn-recover.service -f
sudo cp /var/www/site1vpn/prisma/production.db /root/site1vpn-$(date +%F).db
```

If the site unexpectedly closes connections, inspect the application, Nginx,
kernel OOM log, memory, and disk:

```bash
sudo systemctl status site1vpn nginx --no-pager
sudo journalctl -u site1vpn -u nginx --since "2 hours ago" --no-pager
sudo journalctl -k --since "2 hours ago" --no-pager | grep -Ei "oom|out of memory|killed process"
free -h
df -h
```

The health check verifies the application on port 3000 and the local HTTPS
proxy every minute. It restarts only the failed service. To inspect its latest
result:

```bash
sudo systemctl status site1vpn-healthcheck.service --no-pager
sudo journalctl -u site1vpn-healthcheck.service --since "30 minutes ago" --no-pager
```

Back up the SQLite database regularly. Do not commit `.env` or any `.db` file.
