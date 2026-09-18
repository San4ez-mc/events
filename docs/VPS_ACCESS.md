# VPS access & shared-server layout

Kiro is **not** part of the FINEKO ecosystem — it just happens to live on the
same physical VPS, in its own directory, with its own git repo, own
PostgreSQL role/databases, and (eventually) its own nginx vhost. Nothing here
is shared with other services beyond the box itself.

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
- Extensions enabled on both: `postgis`, `pg_trgm`.
- Local dev reaches it through an SSH tunnel — see `pnpm db:tunnel` (root
  package.json) / `infrastructure/scripts/db-tunnel.sh` /
  `db-tunnel.ps1`. This forwards `localhost:5433` → VPS `127.0.0.1:5432`.
  `apps/api/.env`'s `DATABASE_URL` points at that local port.

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
them). Not created yet — this repo is still local-only; nothing has been
deployed there.

## What's already been done here (Phase 0)

- [x] SSH key-based access provisioned.
- [x] PostgreSQL role `kiro` + `kiro_dev`/`kiro_test` databases created.
- [x] `postgis` + `pg_trgm` extensions installed and enabled.
- [ ] Production database `kiro`, MinIO container, nginx vhost, systemd/PM2
      service — all deferred until we actually ship something.
