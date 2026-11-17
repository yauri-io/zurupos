-- migrate:up

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  address text,
  phone text,
  -- IANA name; validated by the API against Intl (SPEC §4.1).
  timezone text not null default 'Asia/Jakarta',
  business_day_cutoff_hour smallint not null default 0 check (business_day_cutoff_hour between 0 and 6),
  receipt_header text,
  receipt_footer text,
  service_charge_enabled boolean not null default false,
  service_charge_bps integer not null default 0 check (service_charge_bps between 0 and 10000),
  tax_enabled boolean not null default false,
  tax_name text not null default 'PB1' check (length(btrim(tax_name)) between 1 and 40),
  tax_bps integer not null default 0 check (tax_bps between 0 and 10000),
  tax_on_service_charge boolean not null default true,
  enabled_payment_methods text[] not null default '{cash,qris,debit,credit,transfer,other}'
    check (enabled_payment_methods <@ array['cash','qris','debit','credit','transfer','other']::text[]),
  low_stock_alerts_enabled boolean not null default true,
  alert_extra_emails text[] not null default '{}',
  idle_lock_minutes smallint not null default 15 check (idle_lock_minutes between 0 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null check (length(btrim(name)) between 1 and 80),
  role text not null check (role in ('owner', 'manager', 'cashier', 'employee')),
  email citext,
  password_hash text,
  pin_hash text not null,
  locale text not null default 'id' check (locale in ('id', 'en')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  -- Owners and managers sign in to the dashboard with email; cashiers and employees never do.
  constraint users_email_by_role check ((role in ('owner', 'manager')) = (email is not null)),
  constraint users_password_by_role check (password_hash is null or role in ('owner', 'manager'))
);
-- MVP: one email = one shop, across all tenants (SPEC §4.1).
create unique index users_email_key on users (email) where email is not null;
-- Exactly one active owner per tenant.
create unique index users_one_active_owner on users (tenant_id) where role = 'owner' and is_active;

create table devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null check (length(btrim(name)) between 1 and 60),
  token_hash bytea not null unique check (length(token_hash) = 32),
  paired_by_user_id uuid not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, paired_by_user_id) references users (tenant_id, id)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  user_id uuid not null,
  kind text not null check (kind in ('dashboard', 'staff')),
  device_id uuid,
  token_hash bytea not null unique check (length(token_hash) = 32),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, user_id) references users (tenant_id, id),
  foreign key (tenant_id, device_id) references devices (tenant_id, id),
  constraint sessions_device_by_kind check ((kind = 'staff') = (device_id is not null))
);
create index sessions_device_idx on sessions (tenant_id, device_id) where device_id is not null;
create index sessions_user_idx on sessions (tenant_id, user_id);

create table pin_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  user_id uuid not null,
  device_id uuid not null,
  failed_count integer not null default 0 check (failed_count >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (user_id, device_id),
  foreign key (tenant_id, user_id) references users (tenant_id, id),
  foreign key (tenant_id, device_id) references devices (tenant_id, id)
);

create table password_resets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  user_id uuid not null,
  token_hash bytea not null unique check (length(token_hash) = 32),
  purpose text not null check (purpose in ('reset', 'invite')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, user_id) references users (tenant_id, id)
);
create index password_resets_user_idx on password_resets (tenant_id, user_id);

-- migrate:down
drop table password_resets;
drop table pin_attempts;
drop table sessions;
drop table devices;
drop table users;
drop table tenants;
