#!/bin/bash
set -euo pipefail

export NVM_DIR="/root/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null

cd /home/reperto/repertorio/apps/web
exec pnpm start --port 3001
