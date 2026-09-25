#!/usr/bin/env bash
# §108 — daily backup of the Kiro Postgres DB + MinIO bucket. Runs ON THE VPS.
# Touches only Kiro resources (DB `kiro`, bucket `kiro`). Keeps 14 days.
#
# Install (one-time, as root):
#   install -m 750 /var/www/kiro/infrastructure/deploy/backup.sh /usr/local/bin/kiro-backup
#   echo '30 3 * * * root /usr/local/bin/kiro-backup >> /var/log/kiro-backup.log 2>&1' > /etc/cron.d/kiro-backup
#
# Restore: see docs/DEPLOY.md ("Backups & restore").
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/kiro}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB_NAME="${DB_NAME:-kiro}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
umask 077

# Database: custom-format dump (pg_restore-able, compressed).
# Redirect by root (not --file): the postgres OS user cannot write into the root-owned backup dir.
sudo -u postgres pg_dump --format=custom "$DB_NAME" > "$BACKUP_DIR/db-$DB_NAME-$STAMP.dump"

# Media: mirror the bucket with the MinIO client if it is configured (alias `kiro`).
if command -v mc >/dev/null 2>&1 && mc alias list kiro >/dev/null 2>&1; then
  mc mirror --overwrite --quiet kiro/kiro "$BACKUP_DIR/media" || echo "WARN: media mirror failed"
else
  echo "INFO: mc alias 'kiro' not configured — skipping media mirror"
fi

# Rotate old DB dumps.
find "$BACKUP_DIR" -maxdepth 1 -name "db-$DB_NAME-*.dump" -mtime "+$KEEP_DAYS" -delete

echo "$(date -Is) backup ok: db-$DB_NAME-$STAMP.dump"
