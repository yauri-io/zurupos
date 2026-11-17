-- migrate:up

-- Append-only: zuru_app has INSERT + SELECT only.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  actor_user_id uuid not null,
  action text not null check (length(action) between 1 and 60),
  entity_type text not null check (length(entity_type) between 1 and 40),
  entity_id uuid,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, actor_user_id) references users (tenant_id, id)
);
create index audit_log_created_idx on audit_log (tenant_id, created_at);

-- System table, no tenant RLS (SPEC §3.5). zuru_app: INSERT only. zuru_worker: SELECT, UPDATE.
-- Content is fully rendered at enqueue time inside the tenant transaction.
create table outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  kind text not null check (kind in ('low_stock', 'password_reset', 'manager_invite')),
  to_addresses text[] not null check (cardinality(to_addresses) >= 1),
  subject text not null,
  html text not null,
  text text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index outbox_pending_idx on outbox (next_attempt_at, created_at) where status = 'pending';

-- migrate:down
drop table outbox;
drop table audit_log;
