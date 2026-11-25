-- migrate:up

-- Report emails (SPEC §12.6, D-074, D-075).

-- Owner's switches, both on by default.
alter table tenants
  add column daily_summary_enabled boolean not null default true,
  add column weekly_summary_enabled boolean not null default true;

-- One row per (shop, kind, period) sent. Inserted in the same transaction as the
-- outbox row, so a period is emailed at most once even with parallel scheduler
-- passes. Append-only: zuru_app has INSERT + SELECT only.
create table report_email_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  kind text not null check (kind in ('daily_summary', 'weekly_summary')),
  period_start date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, kind, period_start)
);

alter table report_email_runs enable row level security;
alter table report_email_runs force row level security;
create policy tenant_isolation on report_email_runs
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));
create trigger set_updated_at before update on report_email_runs
  for each row execute function set_updated_at();

grant select, insert on report_email_runs to zuru_app;

-- D-075: the fifth reviewed pre-tenant function. The scheduler has no session or
-- device token, so it learns which shops to visit from here and then works on
-- each one inside withTenant under normal RLS. Schedule fields only: no names,
-- emails or money.
create policy auth_definer_lookup on tenants for select to zuru_owner using (true);

create function auth.report_schedule()
returns table (
  tenant_id uuid,
  timezone text,
  business_day_cutoff_hour smallint,
  daily_summary_enabled boolean,
  weekly_summary_enabled boolean
)
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select t.id, t.timezone, t.business_day_cutoff_hour, t.daily_summary_enabled, t.weekly_summary_enabled
  from public.tenants t
  where (t.daily_summary_enabled or t.weekly_summary_enabled)
    and exists (
      select 1 from public.users u
      where u.tenant_id = t.id and u.role = 'owner' and u.is_active and u.email is not null
    )
$$;

revoke execute on function auth.report_schedule() from public;
grant execute on function auth.report_schedule() to zuru_app;

-- migrate:down
drop function auth.report_schedule();
drop policy auth_definer_lookup on tenants;
drop table report_email_runs;
alter table tenants drop column weekly_summary_enabled, drop column daily_summary_enabled;
