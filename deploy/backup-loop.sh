#!/bin/sh
# Nightly backup (D-049). Runs in the `backup` service of compose.prod.yml.
# Once a day at BACKUP_AT (HHMM, in TZ) it writes a custom-format pg_dump of
# the whole `zuru` database to /backups and deletes dumps older than
# BACKUP_KEEP_DAYS. Dumps are written to a temp name first, so a half-written
# file never looks like a backup. `backup-loop.sh now` takes one backup and exits.
set -eu

: "${BACKUP_AT:=0300}"
: "${BACKUP_KEEP_DAYS:=14}"

backup() {
  name="zuru-$(date +%Y%m%d-%H%M).dump"
  # Superuser: RLS is forced on the tenant tables, so only a superuser sees every row.
  # `set -e` doesn't apply inside `if backup`, so each step returns on failure.
  pg_dump --format=custom --file="/backups/.$name.part" "$PGDATABASE" || return 1
  mv "/backups/.$name.part" "/backups/$name" || return 1
  find /backups -maxdepth 1 -name 'zuru-*.dump' -mtime "+$BACKUP_KEEP_DAYS" -delete
  echo "backup: wrote $name ($(du -h "/backups/$name" | cut -f1))"
}

if [ "${1:-}" = now ]; then
  backup
  exit 0
fi

echo "backup: daily at $BACKUP_AT ($TZ), keeping $BACKUP_KEEP_DAYS days"
last=''
while true; do
  today=$(date +%Y%m%d)
  if [ "$(date +%H%M)" = "$BACKUP_AT" ] && [ "$last" != "$today" ]; then
    # A failed dump is logged and retried the next day; the loop keeps running.
    backup || echo "backup: FAILED" >&2
    last=$today
  fi
  sleep 30
done
