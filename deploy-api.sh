#!/usr/bin/env bash
set -e

echo "▶ Repertorio API deploy started"
echo "--------------------------------"

APP_DIR="/home/reperto/repertorio/apps/api"
SERVICE="repertorio-api"

cd "$APP_DIR"

echo "▶ Stopping API service..."
systemctl stop "$SERVICE"

echo "▶ Installing deps (if needed)..."
pnpm install --frozen-lockfile

echo "▶ Building NestJS API..."
pnpm build

echo "▶ Starting API service..."
systemctl start "$SERVICE"

echo "▶ Verifying service status..."
systemctl --no-pager status "$SERVICE" | head -n 20

echo "--------------------------------"
echo "✅ Repertorio API deploy finished successfully"

