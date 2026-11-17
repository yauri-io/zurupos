-- migrate:up

-- D-024 hardening: pg_temp goes last in each auth.* definer's search_path, so a
-- caller's temporary objects can never shadow anything these functions resolve.
alter function auth.find_login_by_email(text) set search_path = pg_catalog, public, pg_temp;
alter function auth.find_session(bytea) set search_path = pg_catalog, public, pg_temp;
alter function auth.find_device(bytea) set search_path = pg_catalog, public, pg_temp;
alter function auth.find_password_reset(bytea) set search_path = pg_catalog, public, pg_temp;

-- migrate:down
alter function auth.find_login_by_email(text) set search_path = pg_catalog, public;
alter function auth.find_session(bytea) set search_path = pg_catalog, public;
alter function auth.find_device(bytea) set search_path = pg_catalog, public;
alter function auth.find_password_reset(bytea) set search_path = pg_catalog, public;
