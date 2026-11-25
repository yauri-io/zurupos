#!/bin/sh
# Restore a backup made by backup-loop.sh (docs/DEPLOY.md, "Backups").
#
#   deploy/restore.sh check   zuru-20261201-0300.dump   # restore into a scratch
#       database, compare row counts with the live one, drop it. Safe any time.
#   deploy/restore.sh replace zuru-20261201-0300.dump   # replace the live database.
#       Stops the API, worker and scheduler, drops `zuru`, restores, starts them again.
#
# The file name is relative to BACKUP_DIR (the backup service's /backups).
set -eu
dir=$(cd "$(dirname "$0")" && pwd)
# </dev/null: `exec -T` would otherwise swallow the confirmation typed below.
compose() { "$dir/prod.sh" "$@" </dev/null; }
psql_() { compose exec -T backup psql -v ON_ERROR_STOP=1 -X -q "$@"; }

mode=${1:-}
file=${2:-}
if [ -z "$file" ] || { [ "$mode" != check ] && [ "$mode" != replace ]; }; then
  echo "usage: $0 check|replace <dump file in BACKUP_DIR>" >&2
  exit 2
fi
compose exec -T backup test -f "/backups/$file" || { echo "no such backup: $file" >&2; exit 1; }

# Row counts per table (exact), as the superuser so RLS doesn't hide rows.
counts() {
  psql_ -d "$1" -At -c "
    select string_agg(format('%s=%s', table_name,
      (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text),
      ' ' order by table_name)
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'"
}

if [ "$mode" = check ]; then
  scratch=zuru_restore_check
  psql_ -d postgres -c "drop database if exists $scratch" -c "create database $scratch owner zuru_owner"
  compose exec -T backup pg_restore --exit-on-error --dbname="$scratch" "/backups/$file"
  restored=$(counts "$scratch")
  live=$(counts zuru)
  psql_ -d postgres -c "drop database $scratch"
  echo "restored: $restored" | tr ' ' '\n'
  if [ "$restored" = "$live" ]; then
    echo "check: OK, the backup restores and matches the live row counts"
  else
    echo "check: restored fine; row counts differ from live (expected if orders came in since the backup)"
  fi
  exit 0
fi

printf 'This REPLACES the live database with %s. Type the word restore to continue: ' "$file"
read -r answer
[ "$answer" = restore ] || { echo "cancelled"; exit 1; }
compose stop api worker scheduler
psql_ -d postgres -c "drop database zuru with (force)"
# --create recreates the database with its owner, grants and settings.
compose exec -T backup pg_restore --exit-on-error --create --dbname=postgres "/backups/$file"
compose up -d --wait api worker scheduler
echo "replace: done; counts now:"
counts zuru | tr ' ' '\n'
