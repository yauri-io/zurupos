#!/bin/sh
# Local development only (D-014). Runs once, as the Postgres superuser, when the
# container's data volume is first created. Production role setup is documented
# separately and never executed by this script.
set -eu

: "${ZURU_MIGRATOR_PASSWORD:?}"
: "${ZURU_APP_PASSWORD:?}"
: "${ZURU_WORKER_PASSWORD:?}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v migrator_pw="$ZURU_MIGRATOR_PASSWORD" \
  -v app_pw="$ZURU_APP_PASSWORD" \
  -v worker_pw="$ZURU_WORKER_PASSWORD" <<'SQL'
-- Owns every schema object. Cannot log in.
create role zuru_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole;

-- Runs migrations. Every session becomes zuru_owner, so all objects it creates
-- (including dbmate's schema_migrations) are owned by zuru_owner.
create role zuru_migrator login nosuperuser nobypassrls nocreatedb nocreaterole
  password :'migrator_pw' in role zuru_owner;
alter role zuru_migrator set role = 'zuru_owner';

-- API runtime role. Must never own tables or bypass RLS (SPEC §3.1).
create role zuru_app login nosuperuser nobypassrls nocreatedb nocreaterole
  password :'app_pw';

-- Outbox worker. SELECT/UPDATE on outbox only (SPEC §3.5).
create role zuru_worker login nosuperuser nobypassrls nocreatedb nocreaterole
  password :'worker_pw';

create database zuru owner zuru_owner;
create database zuru_test owner zuru_owner;
SQL

for db in zuru zuru_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" -v db="$db" <<'SQL'
create extension if not exists citext;
revoke all on database :"db" from public;
grant connect on database :"db" to zuru_migrator, zuru_app, zuru_worker;
-- public schema: only the owner may create objects in it.
revoke create on schema public from public;
SQL
done
