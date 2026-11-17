-- migrate:up

create table categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null check (length(btrim(name)) between 1 and 60),
  sort integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  category_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  price bigint not null check (price >= 0),
  color text not null default 'neutral' check (length(color) between 1 and 30),
  sort integer not null default 0,
  is_active boolean not null default true,
  is_available boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, category_id) references categories (tenant_id, id)
);
create index items_category_idx on items (tenant_id, category_id);

create table modifier_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null check (length(btrim(name)) between 1 and 60),
  selection text not null check (selection in ('single', 'multiple')),
  min_select integer not null default 0,
  max_select integer not null default 1,
  sort integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint modifier_groups_min_max check (min_select >= 0 and max_select >= 1 and min_select <= max_select),
  constraint modifier_groups_single_max check (selection <> 'single' or max_select = 1)
);

create table modifier_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  group_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  -- Negative deltas are not allowed in MVP (SPEC §4.1).
  price_delta bigint not null default 0 check (price_delta >= 0),
  is_default boolean not null default false,
  sort integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, group_id) references modifier_groups (tenant_id, id)
);
create index modifier_options_group_idx on modifier_options (tenant_id, group_id);

create table item_modifier_groups (
  tenant_id uuid not null references tenants (id),
  item_id uuid not null,
  group_id uuid not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, group_id),
  foreign key (tenant_id, item_id) references items (tenant_id, id),
  foreign key (tenant_id, group_id) references modifier_groups (tenant_id, id)
);
create index item_modifier_groups_group_idx on item_modifier_groups (tenant_id, group_id);

-- migrate:down
drop table item_modifier_groups;
drop table modifier_options;
drop table modifier_groups;
drop table items;
drop table categories;
