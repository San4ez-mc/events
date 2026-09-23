#!/usr/bin/env bash
# Run ON THE VPS from /var/www/kiro after `git pull`. Idempotent.
# Prereqs (one-time, see docs/DEPLOY.md): apps/api/.env with production values,
# production DB `kiro` with postgis + pg_trgm, pm2 installed, pnpm installed.
set -euo pipefail

cd /var/www/kiro

pnpm install --frozen-lockfile
pnpm --filter @kiro/api prisma:generate
pnpm --filter @kiro/api prisma:deploy      # applies committed migrations only
pnpm --filter @kiro/api build

# API_URL is baked into Next's rewrites at build time
API_URL=http://127.0.0.1:5100 pnpm --filter @kiro/web build

pm2 startOrReload infrastructure/deploy/ecosystem.config.cjs --update-env
pm2 save
