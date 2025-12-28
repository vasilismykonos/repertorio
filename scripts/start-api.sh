#!/bin/bash
set -euo pipefail

# start-api.sh – Εκκίνηση NestJS API (production)

export NVM_DIR="/root/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
else
  echo "nvm.sh not found in $NVM_DIR"
  exit 1
fi

nvm use 22 >/dev/null

cd /home/reperto/repertorio/apps/api

# Φόρτωση env vars (ώστε Prisma/ES index να είναι deterministic)
ENV_FILE="/home/reperto/repertorio/apps/api/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
else
  echo "ENV file not found: $ENV_FILE"
  exit 1
fi

# Ασφάλεια: επιβεβαίωση ότι φορτώθηκε DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is empty after sourcing $ENV_FILE"
  exit 1
fi

# Production start (χωρίς watch/dev)
exec node dist/main.js
