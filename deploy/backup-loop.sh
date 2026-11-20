#!/bin/sh
# Nightly backup (D-049, D-052). Runs in the `backup` service of compose.prod.yml.
# Once a day at BACKUP_AT (HHMM, in TZ) it writes a custom-format pg_dump of
# the whole `zuru` database to /backups, deletes local dumps older than
# BACKUP_KEEP_DAYS, and, when R2_BUCKET is set, copies to R2 every dump the
# bucket doesn't have yet. Dumps are written to a temp name first, so a
# half-written file never looks like a backup. When BACKUP_PING_URL is set, each
# run reports success or failure to it (a dead-man's-switch monitor).
# `backup-loop.sh now` takes one backup and exits.
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

# `copy` skips dumps already in the bucket and never deletes there (an R2
# lifecycle rule expires old ones), so a failed upload is retried the next run.
offsite() {
  [ -n "${R2_BUCKET:-}" ] || return 0
  rclone copy --include 'zuru-*.dump' --retries 3 /backups "r2:$R2_BUCKET" || return 1
  echo "backup: copied to r2:$R2_BUCKET ($(rclone lsf --include 'zuru-*.dump' "r2:$R2_BUCKET" | wc -l) dumps there)"
}

ping_monitor() {
  [ -n "${BACKUP_PING_URL:-}" ] || return 0
  wget -q -O /dev/null -T 10 "$BACKUP_PING_URL$1" || echo "backup: could not reach BACKUP_PING_URL" >&2
}

run() {
  if backup && offsite; then
    ping_monitor ''
  else
    echo "backup: FAILED" >&2
    ping_monitor /fail
    return 1
  fi
}

if [ "${1:-}" = now ]; then
  run
  exit
fi

echo "backup: daily at $BACKUP_AT ($TZ), keeping $BACKUP_KEEP_DAYS days${R2_BUCKET:+, copying to r2:$R2_BUCKET}"
last=''
while true; do
  today=$(date +%Y%m%d)
  if [ "$(date +%H%M)" = "$BACKUP_AT" ] && [ "$last" != "$today" ]; then
    # A failed run is logged and retried the next day; the loop keeps running.
    run || true
    last=$today
  fi
  sleep 30
done
