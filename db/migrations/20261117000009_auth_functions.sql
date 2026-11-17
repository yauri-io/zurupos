-- migrate:up

-- Pre-tenant lookups (SPEC §3.4). These four SECURITY DEFINER functions are the
-- complete list of RLS exceptions; adding one needs a DECISIONS.md entry and an
-- isolation test. Each returns the minimum columns needed and pins search_path.
create schema auth;
revoke all on schema auth from public;
grant usage on schema auth to zuru_app;

create function auth.find_login_by_email(p_email text)
returns table (user_id uuid, tenant_id uuid, role text, password_hash text, is_active boolean)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select u.id, u.tenant_id, u.role, u.password_hash, u.is_active
  from public.users u
  where u.email = p_email::public.citext
    and u.role in ('owner', 'manager')
$$;

create function auth.find_session(p_token_hash bytea)
returns table (
  session_id uuid, user_id uuid, tenant_id uuid, role text, kind text,
  device_id uuid, expires_at timestamptz, revoked_at timestamptz
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select s.id, s.user_id, s.tenant_id, u.role, s.kind, s.device_id, s.expires_at, s.revoked_at
  from public.sessions s
  join public.users u on u.tenant_id = s.tenant_id and u.id = s.user_id
  where s.token_hash = p_token_hash
$$;

create function auth.find_device(p_token_hash bytea)
returns table (device_id uuid, tenant_id uuid, revoked_at timestamptz)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select d.id, d.tenant_id, d.revoked_at
  from public.devices d
  where d.token_hash = p_token_hash
$$;

create function auth.find_password_reset(p_token_hash bytea)
returns table (user_id uuid, tenant_id uuid, expires_at timestamptz, used_at timestamptz)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select r.user_id, r.tenant_id, r.expires_at, r.used_at
  from public.password_resets r
  where r.token_hash = p_token_hash
$$;

revoke execute on all functions in schema auth from public;
grant execute on all functions in schema auth to zuru_app;

-- migrate:down
drop schema auth cascade;
