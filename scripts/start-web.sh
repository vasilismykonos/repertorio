#!/bin/bash
# start-web.sh – Εκκίνηση Next.js frontend για repertorio

# Φόρτωση nvm / Node 22
export NVM_DIR="/root/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
else
  echo "nvm.sh not found in $NVM_DIR"
  exit 1
fi

nvm use 22 >/dev/null

cd /home/reperto/repertorio/apps/web

# Dev server στην 3001
exec pnpm dev --port 3001

