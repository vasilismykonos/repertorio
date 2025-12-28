#!/bin/bash
set -euo pipefail

export NVM_DIR="/root/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
else
  echo "nvm.sh not found in $NVM_DIR"
  exit 1
fi

nvm use 22 >/dev/null

cd /home/reperto/repertorio/apps/web

pnpm install --frozen-lockfile
pnpm build
exec pnpm start --port 3001
