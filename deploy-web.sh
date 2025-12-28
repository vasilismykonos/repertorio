#!/usr/bin/env bash
set -e

echo "▶ Repertorio WEB deploy started"
echo "--------------------------------"

APP_DIR="/home/reperto/repertorio/apps/web"
SERVICE="repertorio-web"

cd "$APP_DIR"

echo "▶ Stopping web service..."
systemctl stop "$SERVICE"

echo "▶ Cleaning .next build..."
rm -rf .next

echo "▶ Installing deps (if needed)..."
pnpm install --frozen-lockfile

echo "▶ Building Next.js app..."
pnpm build

echo "▶ Starting web service..."
systemctl start "$SERVICE"

echo "▶ Verifying service status..."
systemctl --no-pager status "$SERVICE" | head -n 20

echo "--------------------------------"
echo "✅ Repertorio WEB deploy finished successfully"

