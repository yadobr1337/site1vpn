#!/usr/bin/env bash

set -u

APP_HEALTH_URL="http://127.0.0.1:3000/api/health"
HTTPS_HEALTH_URL="https://the1vpn.ru/api/health"

log() {
  echo "[site1vpn-healthcheck] $*"
  logger -t site1vpn-healthcheck -- "$*"
}

snapshot() {
  log "Capturing recovery snapshot"
  free -m || true
  df -h / || true
  ss -ltnp | grep -E ':(80|443|3000)\b' || true
  systemctl status site1vpn.service nginx.service --no-pager || true
}

check_app() {
  curl --fail --silent --show-error --max-time 10 --output /dev/null "$APP_HEALTH_URL"
}

check_https() {
  curl \
    --fail \
    --silent \
    --show-error \
    --max-time 15 \
    --insecure \
    --resolve the1vpn.ru:443:127.0.0.1 \
    --output /dev/null \
    "$HTTPS_HEALTH_URL"
}

if ! check_app; then
  snapshot
  log "Next.js health check failed; restarting site1vpn.service"
  systemctl restart site1vpn.service
  sleep 5

  if ! check_app; then
    log "Next.js is still unavailable after restart"
    exit 1
  fi
fi

if ! systemctl is-active --quiet nginx.service; then
  snapshot
  log "nginx.service is inactive; restarting it"
  nginx -t
  systemctl restart nginx.service
  sleep 2
fi

if ! check_https; then
  snapshot
  log "Local HTTPS proxy check failed; restarting nginx.service"
  nginx -t
  systemctl restart nginx.service
  sleep 2

  if ! check_https; then
    log "HTTPS is still unavailable after nginx restart"
    exit 1
  fi
fi

log "Next.js and HTTPS are healthy"
