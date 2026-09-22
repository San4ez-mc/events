# VPS access & shared-server layout

Kiro is **not** part of the FINEKO ecosystem — it just happens to live on the
same physical VPS, in its own directory, with its own git repo, own
PostgreSQL role/databases, own MinIO buckets, and (eventually) its own nginx
vhost. Nothing here is shared with other services beyond the box itself.

## Server

- Host: `173.242.62.180` (Ubuntu 24.04)
- Admin access: SSH key only (root password auth was used once to install the
  key, then never touched again). The private key lives at
  `.secrets/kiro_vps_deploy_key` (gitignored, not in the repo).
- If that key is ever lost/rotated: SSH in with the root password (ask
  whoever holds it), append a new `ssh-ed25519` pubkey to
  `~/.ssh/authorized_keys`, done.

## PostgreSQL (existing instance, shared box — own role & DBs)

- Postgres 16, listening on `127.0.0.1:5432` only (not exposed publicly).
- Role: `kiro` (password in `apps/api/.env`, never in git).
- Databases: `kiro_dev` (this app's dev DB, used via SSH tunnel from your
  machine) and `kiro_test` (for CI/integration tests, same tunnel).
  `kiro` (production) gets created when we actually deploy.
- Extensions enabled on both: `postgis`, `pg_trgm`. `prisma migrate reset`
  drops and recreates the `public` schema, which takes any extensions
  installed into it down with it — re-run
  `sudo -u postgres psql -d <db> -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pg_trgm;"`
  after any reset (this bit us once on `kiro_dev` — search silently 500'd
  with `function similarity(text, text) does not exist` until re-enabled).

## MinIO (own Docker container, `kiro-minio`)

- Image: `quay.io/minio/minio` (Docker Hub blocks anonymous pulls of
  `minio/minio` now — use the quay.io mirror).
- Bound to `127.0.0.1:5102` (S3 API) and `127.0.0.1:5103` (console) only —
  not exposed publicly, same pattern as Postgres.
- Data dir: `/var/www/kiro/minio-data` on the VPS (persisted volume).
- Buckets: `kiro-dev`, `kiro-test`, both with anonymous **download** policy
  (public-read, so event photos can be served directly by URL without
  proxying through the API) but not public-write/list.
- Credentials: in `apps/api/.env` (`S3_ACCESS_KEY`/`S3_SECRET_KEY`), never in git.
- Restart policy: `unless-stopped`, so it survives a VPS reboot.

## Local dev tunnel

Both Postgres and MinIO are reached through one SSH tunnel — `pnpm db:tunnel`
(root `package.json`) / `infrastructure/scripts/db-tunnel.mjs`. It forwards:

| Local port | → VPS port | Service       |
|------------|-----------|----------------|
| `5433`     | `5432`    | PostgreSQL     |
| `5502`     | `5102`    | MinIO S3 API   |
| `5503`     | `5103`    | MinIO console  |

`apps/api/.env`'s `DATABASE_URL`/`S3_ENDPOINT` point at these local ports.
Keep the tunnel running in its own terminal while developing.

## Reserved ports on the VPS (for when we actually deploy)

The box already runs several other services (FINEKO ecosystem) on ports
3000-4800 and 8091. Kiro's production processes should use:

| Service        | Port |
|----------------|------|
| API (NestJS)   | 5100 |
| Web (Next.js)  | 5101 |
| MinIO API      | 5102 |
| MinIO console  | 5103 |

Nginx (already installed, already terminates TLS for other `*.fineko.space`
sites via certbot) will reverse-proxy `kiro.fineko.space` → `127.0.0.1:5101`
(web) and `kiro.fineko.space/api` → `127.0.0.1:5100` (api), or a dedicated
`api.kiro.fineko.space` — decide when we get to the deployment phase.

## Directory on the server

Planned: `/var/www/kiro` (sibling to the FINEKO folders, not inside any of
them). Currently only `/var/www/kiro/minio-data` exists (MinIO's volume) —
the app itself hasn't been deployed there yet; this repo is still local-only.

## What's already been done here

- [x] SSH key-based access provisioned.
- [x] PostgreSQL role `kiro` + `kiro_dev`/`kiro_test` databases created.
- [x] `postgis` + `pg_trgm` extensions installed and enabled.
- [x] MinIO container running, `kiro-dev`/`kiro-test` buckets created with
      public-read policy.
- [ ] Production database `kiro`, production MinIO bucket, nginx vhost,
      systemd/PM2 service — all deferred until we actually ship something.
