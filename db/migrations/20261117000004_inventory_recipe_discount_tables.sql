-- migrate:up

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null check (length(btrim(name)) between 1 and 80),
  base_unit text not null check (base_unit in ('g', 'ml', 'pcs')),
  -- May go negative: stock never blocks a sale.
  stock_qty numeric(14, 3) not null default 0,
  low_stock_threshold numeric(14, 3) not null default 0 check (low_stock_threshold >= 0),
  avg_cost numeric(16, 4) not null default 0 check (avg_cost >= 0),
  purchase_unit_name text check (length(btrim(purchase_unit_name)) between 1 and 40),
  purchase_unit_size numeric(14, 3) check (purchase_unit_size > 0),
  low_stock_alerted_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint ingredients_purchase_unit_pair check ((purchase_unit_name is null) = (purchase_unit_size is null))
);
create unique index ingredients_name_key on ingredients (tenant_id, lower(name)) where archived_at is null;

create table recipe_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  item_id uuid not null,
  ingredient_id uuid not null,
  qty numeric(14, 3) not null check (qty > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (item_id, ingredient_id),
  foreign key (tenant_id, item_id) references items (tenant_id, id),
  foreign key (tenant_id, ingredient_id) references ingredients (tenant_id, id)
);

create table modifier_option_effects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  option_id uuid not null,
  effect text not null check (effect in ('add', 'remove', 'replace')),
  -- add: ingredient to add; remove: ingredient to remove; replace: the NEW ingredient.
  ingredient_id uuid not null,
  -- replace only: the ingredient being replaced.
  target_ingredient_id uuid,
  qty numeric(14, 3),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, option_id) references modifier_options (tenant_id, id),
  foreign key (tenant_id, ingredient_id) references ingredients (tenant_id, id),
  foreign key (tenant_id, target_ingredient_id) references ingredients (tenant_id, id),
  constraint modifier_option_effects_shape check (
    (effect = 'add' and target_ingredient_id is null and qty is not null and qty > 0)
    or (effect = 'remove' and target_ingredient_id is null and qty is null)
    or (effect = 'replace' and target_ingredient_id is not null
        and target_ingredient_id <> ingredient_id and (qty is null or qty > 0))
  )
);
create index modifier_option_effects_option_idx on modifier_option_effects (tenant_id, option_id);

create table discounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  name text not null check (length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('percent', 'fixed')),
  -- percent: basis points (1..10000); fixed: whole rupiah (> 0).
  value bigint not null,
  scope text not null check (scope in ('item', 'order')),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint discounts_value_range check (
    (kind = 'percent' and value between 1 and 10000) or (kind = 'fixed' and value > 0)
  )
);

-- migrate:down
drop table discounts;
drop table modifier_option_effects;
drop table recipe_lines;
drop table ingredients;
