#!/usr/bin/env bash
# Deploys the current branch: pull, build, publish the client, build indexes,
# restart the PM2 processes. Safe to run for the first deploy and every update.
#
#   bash deploy/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."
WEB_ROOT=/var/www/pricewatch

echo "==> Pulling"
git pull --ff-only

echo "==> Building server"
# Dev dependencies are needed to compile, whatever NODE_ENV the shell has.
npm --prefix server ci --include=dev
npm --prefix server run build

echo "==> Building client"
npm --prefix client ci --include=dev
npm --prefix client run build
rsync -a --delete client/dist/ "$WEB_ROOT/"

echo "==> Ensuring database indexes"
npm --prefix server run db:indexes

echo "==> Restarting processes"
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

pm2 status
