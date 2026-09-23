# Deploy: VPS + mobile builds

Nothing here has been run yet. The VPS is shared with other services, so each
server step below should be done deliberately. Ports and server layout:
`docs/VPS_ACCESS.md`.

## 1. VPS (one-time)

1. SSH in with `.secrets/kiro_vps_deploy_key`.
2. Production database (extensions must be created by a superuser):
   ```bash
   sudo -u postgres psql -c "CREATE DATABASE kiro OWNER kiro;"
   sudo -u postgres psql -d kiro -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pg_trgm;"
   ```
3. MinIO: create bucket `kiro` with the same public-download policy as `kiro-dev`.
4. Install tooling if missing: Node 22+, `corepack enable` (pnpm), `npm i -g pm2`.
5. Clone the repo to `/var/www/kiro` (sibling of `minio-data`).
6. Create `/var/www/kiro/apps/api/.env` from `apps/api/.env.example` with
   production values:
   - `NODE_ENV=production`, `PORT=5100`
   - `DATABASE_URL` pointing at `127.0.0.1:5432/kiro` (no tunnel on the server)
   - new random `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (do not reuse dev ones)
   - `APP_URL=https://kiro.fineko.space`, `API_URL=https://kiro.fineko.space`,
     `CORS_ORIGINS=https://kiro.fineko.space`
   - `S3_*` for bucket `kiro` (`S3_ENDPOINT=http://127.0.0.1:5102`)
   - SMTP and payment keys when available
7. nginx: copy `infrastructure/deploy/nginx-kiro.conf` to
   `/etc/nginx/sites-available/kiro.fineko.space`, symlink into
   `sites-enabled`, `nginx -t && systemctl reload nginx`, then
   `certbot --nginx -d kiro.fineko.space`. A DNS A record for
   `kiro.fineko.space` -> `173.242.62.180` must exist first.

## 2. Deploy / redeploy

```bash
cd /var/www/kiro && git pull && bash infrastructure/deploy/deploy.sh
```

First run only: `pm2 startup` (run the command it prints) so processes
survive a reboot.

## 3. Android APK (works without store accounts)

```bash
cd apps/mobile
npx eas-cli login          # free expo.dev account
npx eas-cli build:configure
npx eas-cli build -p android --profile preview
```

The build points the app at `https://kiro.fineko.space`, so step 1-2 must be
done first. iOS builds and both stores need paid developer accounts
(Apple $99/yr, Google Play $25 once); `com.kiro.app` is still a placeholder
bundle ID, so decide the final one before the first store build.
