#!/usr/bin/env bash
# Run ON THE VPS from /var/www/kiro after `git pull`. Idempotent.
# Prereqs (one-time, see docs/DEPLOY.md): apps/api/.env with production values,
# production DB `kiro` with postgis + pg_trgm, pm2 installed, pnpm installed.
set -euo pipefail

cd /var/www/kiro

# API + web (and the workspace packages they use); skip the mobile app's deps
pnpm install --frozen-lockfile --filter "@kiro/api..." --filter "@kiro/web..."
pnpm --filter @kiro/api prisma:generate
pnpm --filter @kiro/api prisma:deploy      # applies committed migrations only

# turbo builds the shared @kiro/* packages first (dependsOn ^build).
# API_URL is baked into Next's rewrites at build time.
API_URL=http://127.0.0.1:5100 pnpm exec turbo run build --filter=@kiro/api --filter=@kiro/web

pm2 startOrReload infrastructure/deploy/ecosystem.config.cjs --update-env
pm2 save
