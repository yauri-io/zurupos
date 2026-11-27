-- migrate:up

-- Online menu, milestone O1 (SPEC §4.1, §12.7, D-078 to D-083). Every table is a
-- normal tenant table: ENABLE + FORCE RLS with the tenant_isolation policy, and
-- composite foreign keys so a row can never point at another shop's media.
-- No SECURITY DEFINER function and no auth_definer_lookup policy here: the public
-- read path (auth.find_public_menu, D-081) and its lookup policies come in O2.

-- Uploaded images (D-079). storage_key is random (32 hex) and never contains a
-- tenant or item id; the WebP variants live at m/<storage_key>-<size>.webp.
create table media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  purpose text not null check (purpose in ('item', 'logo', 'cover', 'gallery')),
  storage_key text not null unique check (storage_key ~ '^[0-9a-f]{32}$'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  bytes integer not null check (bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

-- One row per shop, created on first use; also the lock row for the limits (§12.7).
create table menu_profiles (
  tenant_id uuid primary key references tenants (id),
  is_published boolean not null default false,
  published_at timestamptz,
  description text check (char_length(description) <= 160),
  template text not null default 'papan' check (template in ('foto', 'papan', 'hangat')),
  accent_color text not null default '#6b4f3a' check (accent_color ~ '^#[0-9a-f]{6}$'),
  logo_media_id uuid,
  cover_media_id uuid,
  whatsapp text check (whatsapp ~ '^62[0-9]{8,13}$'),
  instagram text check (instagram ~ '^[a-z0-9._]{1,30}$'),
  -- The host rules live in the API (online-menu/validate.ts); the database keeps
  -- at least https and a sane length.
  maps_url text check (maps_url ~ '^https://' and char_length(maps_url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, logo_media_id) references media (tenant_id, id),
  foreign key (tenant_id, cover_media_id) references media (tenant_id, id)
);

-- Every slug a shop has used, kept forever (D-080). The primary key on slug alone
-- makes it unique across all shops; constraint checks aren't filtered by RLS, so
-- another shop's slug fails the insert without being visible.
create table menu_slugs (
  slug citext primary key check (slug::text ~ '^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$'),
  tenant_id uuid not null references tenants (id),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index menu_slugs_one_current on menu_slugs (tenant_id) where is_current;
create index menu_slugs_tenant_idx on menu_slugs (tenant_id);

-- Weekly opening hours; a weekday without a row is closed. closes < opens means
-- it closes after midnight.
create table menu_hours (
  tenant_id uuid not null references tenants (id),
  weekday smallint not null check (weekday between 1 and 7),
  opens time not null,
  closes time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, weekday),
  check (opens <> closes)
);

-- Up to 6 photos per shop (checked under the menu_profiles lock), by upload order.
create table menu_gallery (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  media_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, media_id),
  foreign key (tenant_id, media_id) references media (tenant_id, id)
);
create index menu_gallery_order_idx on menu_gallery (tenant_id, created_at);

-- View counts per business date and source (O3, D-083). Created now with the rest.
create table menu_views_daily (
  tenant_id uuid not null references tenants (id),
  business_date date not null,
  source text not null check (source in ('qr', 'link')),
  views integer not null default 0 check (views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, business_date, source)
);

-- Item fields for the online menu only. Bootstrap never selects them (D-079).
alter table items
  add column show_online boolean not null default true,
  add column is_recommended boolean not null default false,
  add column photo_media_id uuid,
  add constraint items_photo_media_fk foreign key (tenant_id, photo_media_id) references media (tenant_id, id);
create index items_recommended_idx on items (tenant_id) where is_recommended and archived_at is null;

-- Row Level Security (SPEC §3.2).
alter table media enable row level security;
alter table media force row level security;
create policy tenant_isolation on media
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table menu_profiles enable row level security;
alter table menu_profiles force row level security;
create policy tenant_isolation on menu_profiles
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table menu_slugs enable row level security;
alter table menu_slugs force row level security;
create policy tenant_isolation on menu_slugs
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table menu_hours enable row level security;
alter table menu_hours force row level security;
create policy tenant_isolation on menu_hours
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table menu_gallery enable row level security;
alter table menu_gallery force row level security;
create policy tenant_isolation on menu_gallery
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table menu_views_daily enable row level security;
alter table menu_views_daily force row level security;
create policy tenant_isolation on menu_views_daily
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

create trigger set_updated_at before update on media for each row execute function set_updated_at();
create trigger set_updated_at before update on menu_profiles for each row execute function set_updated_at();
create trigger set_updated_at before update on menu_slugs for each row execute function set_updated_at();
create trigger set_updated_at before update on menu_hours for each row execute function set_updated_at();
create trigger set_updated_at before update on menu_gallery for each row execute function set_updated_at();
create trigger set_updated_at before update on menu_views_daily for each row execute function set_updated_at();

-- Grants (D-015, D-084). DELETE only where a row is replaced or removed: a
-- replaced photo's media row, the week of hours, a gallery photo. Slugs are
-- never deleted (D-080).
grant select, insert, update on media, menu_profiles, menu_slugs, menu_hours, menu_gallery, menu_views_daily to zuru_app;
grant delete on media, menu_hours, menu_gallery to zuru_app;

-- migrate:down
revoke all on media, menu_profiles, menu_slugs, menu_hours, menu_gallery, menu_views_daily from zuru_app;
drop index items_recommended_idx;
alter table items
  drop constraint items_photo_media_fk,
  drop column photo_media_id,
  drop column is_recommended,
  drop column show_online;
drop table menu_views_daily;
drop table menu_gallery;
drop table menu_hours;
drop table menu_slugs;
drop table menu_profiles;
drop table media;
