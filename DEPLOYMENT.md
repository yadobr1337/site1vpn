# Migrating 1VPN to a New Ubuntu VPS

This setup runs one Next.js instance behind Nginx. The application code comes
from GitHub, while secrets and the SQLite production database stay outside Git.

The production database is stored at:

```text
/var/www/site1vpn/prisma/production.db
```

## What GitHub Does Not Transfer

Cloning the repository transfers the application and deployment files. It does
not transfer:

- `/var/www/site1vpn/.env`
- `/var/www/site1vpn/prisma/production.db`
- HTTPS certificates

Copy the old database if existing users, balances, squads, Telegram links, and
settings must remain. Never commit `.env`, the database, or bot tokens to Git.

The Telegram token previously shown in screenshots or messages should be
revoked with BotFather and replaced with a new token before deployment.

## 1. Prepare the New VPS

Use Ubuntu 24.04 and connect as `root`:

```bash
apt update
apt upgrade -y
apt install -y git nginx curl ca-certificates snapd dnsutils ufw

curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
bash /tmp/nodesource_setup.sh
apt install -y nodejs

snap install --classic certbot
ln -sf /snap/bin/certbot /usr/bin/certbot

node --version
npm --version
nginx -v
timedatectl set-ntp true
```

Open SSH, HTTP, and HTTPS:

```bash
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw enable
ufw status
```

## 2. Clone the Application from GitHub

```bash
useradd --system --create-home --shell /usr/sbin/nologin site1vpn
git clone https://github.com/yadobr1337/site1vpn.git /var/www/site1vpn
chown -R site1vpn:site1vpn /var/www/site1vpn
cd /var/www/site1vpn
```

## 3. Transfer Existing Data

Skip this section only when starting with an empty website.

On the old VPS, stop the application and create the final private archive:

```bash
systemctl stop site1vpn-healthcheck.timer site1vpn
tar -C /var/www/site1vpn -czf /root/site1vpn-private-backup.tar.gz \
  .env prisma/production.db
```

Keep the old application stopped so that its database cannot diverge after the
backup. If migration must be rolled back, stop the new application before
starting the old one again.

Copy it from the old VPS to the new VPS:

```bash
scp /root/site1vpn-private-backup.tar.gz root@NEW_VPS_IP:/root/
```

On the new VPS, restore it into the cloned repository:

```bash
cd /var/www/site1vpn
tar -xzf /root/site1vpn-private-backup.tar.gz
chown site1vpn:site1vpn .env prisma/production.db
chmod 600 .env prisma/production.db
```

Delete `/root/site1vpn-private-backup.tar.gz` from both servers after the new
site is confirmed working.

If the old `.env` will not be reused, create a new one:

```bash
cd /var/www/site1vpn
sudo -u site1vpn cp .env.example .env
sudo -u site1vpn nano .env
chmod 600 .env
```

## 4. Configure `.env`

Generate three different secrets:

```bash
openssl rand -base64 32
openssl rand -base64 32
openssl rand -hex 32
```

Set every placeholder in `/var/www/site1vpn/.env`. The required production
values are:

```dotenv
DATABASE_URL="file:./production.db"
NEXTAUTH_URL="https://the1vpn.ru"
NEXTAUTH_SECRET="FIRST_BASE64_SECRET"

ADMIN_EMAIL="your-valid-email@example.com"
ADMIN_PASSWORD="a-strong-password-of-at-least-8-characters"

TELEGRAM_BOT_TOKEN="NEW_TOKEN_FROM_BOTFATHER"
TELEGRAM_WEBHOOK_SECRET="HEX_SECRET"
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="VPNthe1_bot"
NEXT_PUBLIC_SUPPORT_TELEGRAM_URL="https://t.me/VPNthe1_bot"

REMNAWAVE_BASE_URL="https://1vpnpanel.ru/"
REMNAWAVE_API_TOKEN="REMNAWAVE_API_TOKEN"
REMNAWAVE_DEFAULT_INBOUND_UUIDS=""

CRON_SECRET="SECOND_BASE64_SECRET"
PAYMENTS_AUTO_APPROVE="false"
```

Keep optional unused values empty. Email values must be valid email addresses
and URL values must be complete `https://...` URLs. Do not use placeholder text
that is not a valid email or URL because environment validation will stop the
build.

`NEXT_PUBLIC_*` values are embedded during `npm run build`, so rebuild after
changing them.

## 5. Build and Initialize

For a migration with the old production database, do not run `prisma:seed`
unless the administrator credentials in `.env` should overwrite the existing
admin login.

```bash
cd /var/www/site1vpn
sudo -u site1vpn npm ci
sudo -u site1vpn npm run prisma:push
sudo -u site1vpn npm run build

install -d -o site1vpn -g site1vpn /var/www/site1vpn/runtime
sudo -u site1vpn ./deploy/publish-static-home.sh

test -f .next/BUILD_ID && echo "Build ready"
```

For a completely new database, also run:

```bash
sudo -u site1vpn npm run prisma:seed
```

## 6. Install Systemd Services

```bash
cd /var/www/site1vpn

cp deploy/site1vpn.service /etc/systemd/system/site1vpn.service
cp deploy/site1vpn-restart.service /etc/systemd/system/site1vpn-restart.service
cp deploy/site1vpn-restart.path /etc/systemd/system/site1vpn-restart.path
cp deploy/site1vpn-restart.timer /etc/systemd/system/site1vpn-restart.timer
cp deploy/site1vpn-healthcheck.service /etc/systemd/system/site1vpn-healthcheck.service
cp deploy/site1vpn-healthcheck.timer /etc/systemd/system/site1vpn-healthcheck.timer
cp deploy/site1vpn-recover.service /etc/systemd/system/site1vpn-recover.service

install -d /etc/systemd/system/nginx.service.d
cp deploy/nginx-restart.conf /etc/systemd/system/nginx.service.d/restart.conf
chmod 755 deploy/site1vpn-healthcheck.sh deploy/publish-static-home.sh

systemctl daemon-reload
systemctl enable --now site1vpn
systemctl enable --now site1vpn-restart.path
systemctl enable --now site1vpn-restart.timer
```

Do not enable `site1vpn-healthcheck.timer` until HTTPS is configured.

Verify Next.js:

```bash
systemctl status site1vpn --no-pager
curl -fsS http://127.0.0.1:3000/api/health
```

## 7. Configure Nginx Before Moving DNS

```bash
cd /var/www/site1vpn
cp deploy/nginx-the1vpn.ru.conf /etc/nginx/sites-available/the1vpn.ru
ln -sf /etc/nginx/sites-available/the1vpn.ru /etc/nginx/sites-enabled/the1vpn.ru
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

Test the new server directly before changing DNS:

```bash
curl -I -H "Host: the1vpn.ru" http://127.0.0.1/
curl -I -H "Host: the1vpn.ru" http://NEW_VPS_IP/
```

## 8. Point `the1vpn.ru` to the New VPS

At the DNS provider, replace the records with:

```text
A    @      NEW_VPS_IP
A    www    NEW_VPS_IP
```

Delete old `A` records. Add `AAAA` records only when the new VPS has tested
public IPv6. Do not enable Cloudflare Proxy for this deployment.

Wait until public DNS returns only the new IP:

```bash
dig +short the1vpn.ru A @1.1.1.1
dig +short www.the1vpn.ru A @1.1.1.1
```

Both commands must show `NEW_VPS_IP`.

## 9. Enable HTTPS and Health Checks

After DNS points to the new server:

```bash
certbot --nginx -d the1vpn.ru -d www.the1vpn.ru
certbot renew --dry-run

systemctl enable --now site1vpn-healthcheck.timer
systemctl status site1vpn nginx site1vpn-healthcheck.timer --no-pager

curl -fsS https://the1vpn.ru/api/health
curl -I https://the1vpn.ru/
```

The health check verifies Next.js and the local HTTPS proxy every minute. It
restarts only a failed service.

## 10. Configure the Telegram Bot and Webhook

Because the old bot token was exposed, open `@BotFather`, select the bot, use
`/revoke`, and put the newly issued token into `.env` as
`TELEGRAM_BOT_TOKEN`.

For Telegram Login Widget support, configure the bot domain in `@BotFather`:

```text
/setdomain
VPNthe1_bot
the1vpn.ru
```

The domain must not contain `https://` or a path.

After HTTPS works, register the webhook on the new VPS:

```bash
sudo -u site1vpn bash -lc '
  cd /var/www/site1vpn
  set -a
  source .env
  set +a
  curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
    --data-urlencode "url=${NEXTAUTH_URL}/api/telegram/webhook" \
    --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
    --data-urlencode "drop_pending_updates=true"
'
```

Important: use `${TELEGRAM_BOT_TOKEN}` exactly. Do not put the token itself
inside `${...}`.

The response must contain `"ok":true`. Check the result:

```bash
sudo -u site1vpn bash -lc '
  cd /var/www/site1vpn
  set -a
  source .env
  set +a
  curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
'
```

Expected fields:

```json
{
  "ok": true,
  "result": {
    "url": "https://the1vpn.ru/api/telegram/webhook",
    "pending_update_count": 0
  }
}
```

`last_error_message` should be absent. Test linking from the account settings
and send `/start` to the bot.

## 11. Final Verification

```bash
curl -fsS https://the1vpn.ru/api/health
curl -I https://the1vpn.ru/
systemctl status site1vpn nginx site1vpn-healthcheck.timer --no-pager
journalctl -u site1vpn --since "15 minutes ago" --no-pager
```

Check without VPN using both home Wi-Fi and mobile internet. Do not shut down
the old VPS until the new server works from both networks and Telegram linking
has been tested.

## Updating Later

```bash
cd /var/www/site1vpn
systemctl stop site1vpn-healthcheck.timer site1vpn

sudo -u site1vpn git pull --ff-only
sudo -u site1vpn npm ci
sudo -u site1vpn npm run prisma:push
sudo -u site1vpn npm run build
sudo -u site1vpn ./deploy/publish-static-home.sh

cp deploy/site1vpn.service /etc/systemd/system/site1vpn.service
cp deploy/site1vpn-restart.service /etc/systemd/system/site1vpn-restart.service
cp deploy/site1vpn-restart.path /etc/systemd/system/site1vpn-restart.path
cp deploy/site1vpn-restart.timer /etc/systemd/system/site1vpn-restart.timer
cp deploy/site1vpn-healthcheck.service /etc/systemd/system/site1vpn-healthcheck.service
cp deploy/site1vpn-healthcheck.timer /etc/systemd/system/site1vpn-healthcheck.timer
cp deploy/site1vpn-recover.service /etc/systemd/system/site1vpn-recover.service

install -d /etc/systemd/system/nginx.service.d
cp deploy/nginx-restart.conf /etc/systemd/system/nginx.service.d/restart.conf
chmod 755 deploy/site1vpn-healthcheck.sh deploy/publish-static-home.sh

systemctl daemon-reload
systemctl enable --now site1vpn site1vpn-restart.path site1vpn-restart.timer
systemctl enable --now site1vpn-healthcheck.timer
```

When updating Nginx after Certbot has added HTTPS settings, do not overwrite the
complete active virtual host with the HTTP-only template. Apply only the
required `location` changes, then run:

```bash
nginx -t && systemctl reload nginx
```

## Backups and Logs

Create a private backup:

```bash
systemctl stop site1vpn
tar -C /var/www/site1vpn -czf /root/site1vpn-$(date +%F).tar.gz \
  .env prisma/production.db
systemctl start site1vpn
```

Inspect failures:

```bash
systemctl status site1vpn nginx --no-pager
journalctl -u site1vpn -u nginx --since "2 hours ago" --no-pager
journalctl -u site1vpn-healthcheck.service --since "30 minutes ago" --no-pager
journalctl -k --since "2 hours ago" --no-pager | grep -Ei "oom|out of memory|killed process"
free -h
df -h
```
