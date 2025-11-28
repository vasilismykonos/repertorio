#!/bin/bash
# start-api.sh – Εκκίνηση NestJS API για repertorio

# Φόρτωση nvm / Node 22
export NVM_DIR="/root/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
else
  echo "nvm.sh not found in $NVM_DIR"
  exit 1
fi

nvm use 22 >/dev/null

cd /home/reperto/repertorio/apps/api

# Τρέχει σε dev mode (start:dev). Αν έχεις άλλο script, προσαρμόζεις αυτή τη γραμμή.
exec pnpm run start:dev

