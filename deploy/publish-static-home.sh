#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="/var/www/site1vpn"
TARGET_ROOT="$APP_ROOT/runtime/public-home"

cd "$APP_ROOT"

if [[ ! -f ".next/server/app/index.html" || ! -d ".next/static" ]]; then
  echo "Production build is missing. Run npm run build first." >&2
  exit 1
fi

install -d -m 0755 "$TARGET_ROOT/_next/static"
install -m 0644 ".next/server/app/index.html" "$TARGET_ROOT/index.html"
cp -R ".next/static/." "$TARGET_ROOT/_next/static/"
find "$TARGET_ROOT" -type d -exec chmod 0755 {} +
find "$TARGET_ROOT" -type f -exec chmod 0644 {} +

echo "Static homepage published to $TARGET_ROOT"
