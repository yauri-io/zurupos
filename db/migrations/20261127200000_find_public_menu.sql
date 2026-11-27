-- migrate:up

-- D-081: the sixth reviewed pre-tenant function (SPEC §3.4), for the public
-- online menu (O2). A public request has no session or device token, so the API
-- finds the shop behind a slug here and then reads the page inside withTenant,
-- in a read-only transaction, under normal RLS. Returns only the tenant id and
-- the shop's current slug, and only for a published menu of a shop with an
-- active owner; anything else gives no row.

-- SELECT-only lookups for the NOLOGIN owner role (like D-024). users already has one.
create policy auth_definer_lookup on menu_slugs for select to zuru_owner using (true);
create policy auth_definer_lookup on menu_profiles for select to zuru_owner using (true);

create function auth.find_public_menu(p_slug citext)
returns table (tenant_id uuid, current_slug text)
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select s.tenant_id, c.slug::text
  from public.menu_slugs s
  join public.menu_profiles p on p.tenant_id = s.tenant_id and p.is_published
  join public.menu_slugs c on c.tenant_id = s.tenant_id and c.is_current
  where s.slug = p_slug
    and exists (
      select 1 from public.users u
      where u.tenant_id = s.tenant_id and u.role = 'owner' and u.is_active
    )
$$;

revoke execute on function auth.find_public_menu(citext) from public;
grant execute on function auth.find_public_menu(citext) to zuru_app;

-- migrate:down
drop function auth.find_public_menu(citext);
drop policy auth_definer_lookup on menu_profiles;
drop policy auth_definer_lookup on menu_slugs;
