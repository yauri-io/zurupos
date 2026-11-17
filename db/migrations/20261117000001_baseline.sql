-- migrate:up

-- Functions are not executable by PUBLIC by default; every grant is explicit.
-- (Default privileges apply to objects created by zuru_owner, which is the
-- current role of every migration session — see D-014.)
alter default privileges revoke execute on functions from public;

grant usage on schema public to zuru_app, zuru_worker;

-- Tenant context for RLS (SPEC §3.2). Unset → NULL → no row ever matches.
create function app_current_tenant() returns uuid
language sql stable security invoker
set search_path = pg_catalog, public
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;
revoke execute on function app_current_tenant() from public;
grant execute on function app_current_tenant() to zuru_app;

-- Maintains updated_at on every table (SPEC §4, offline-sync readiness).
create function set_updated_at() returns trigger
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
revoke execute on function set_updated_at() from public;

-- migrate:down
drop function set_updated_at();
drop function app_current_tenant();
revoke usage on schema public from zuru_app, zuru_worker;
alter default privileges grant execute on functions to public;
