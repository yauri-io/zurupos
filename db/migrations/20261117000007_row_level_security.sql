-- migrate:up

-- Row Level Security on every tenant table (SPEC §3.2). FORCE applies it to the
-- table owner too. `(select app_current_tenant())` is evaluated once per statement.

alter table tenants enable row level security;
alter table tenants force row level security;
create policy tenant_isolation on tenants
  using (id = (select app_current_tenant()))
  with check (id = (select app_current_tenant()));

alter table users enable row level security;
alter table users force row level security;
create policy tenant_isolation on users
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table devices enable row level security;
alter table devices force row level security;
create policy tenant_isolation on devices
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table sessions enable row level security;
alter table sessions force row level security;
create policy tenant_isolation on sessions
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table pin_attempts enable row level security;
alter table pin_attempts force row level security;
create policy tenant_isolation on pin_attempts
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table password_resets enable row level security;
alter table password_resets force row level security;
create policy tenant_isolation on password_resets
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table categories enable row level security;
alter table categories force row level security;
create policy tenant_isolation on categories
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table items enable row level security;
alter table items force row level security;
create policy tenant_isolation on items
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table modifier_groups enable row level security;
alter table modifier_groups force row level security;
create policy tenant_isolation on modifier_groups
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table modifier_options enable row level security;
alter table modifier_options force row level security;
create policy tenant_isolation on modifier_options
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table item_modifier_groups enable row level security;
alter table item_modifier_groups force row level security;
create policy tenant_isolation on item_modifier_groups
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table ingredients enable row level security;
alter table ingredients force row level security;
create policy tenant_isolation on ingredients
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table recipe_lines enable row level security;
alter table recipe_lines force row level security;
create policy tenant_isolation on recipe_lines
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table modifier_option_effects enable row level security;
alter table modifier_option_effects force row level security;
create policy tenant_isolation on modifier_option_effects
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table discounts enable row level security;
alter table discounts force row level security;
create policy tenant_isolation on discounts
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table order_counters enable row level security;
alter table order_counters force row level security;
create policy tenant_isolation on order_counters
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table orders enable row level security;
alter table orders force row level security;
create policy tenant_isolation on orders
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table order_lines enable row level security;
alter table order_lines force row level security;
create policy tenant_isolation on order_lines
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table order_line_modifiers enable row level security;
alter table order_line_modifiers force row level security;
create policy tenant_isolation on order_line_modifiers
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table payments enable row level security;
alter table payments force row level security;
create policy tenant_isolation on payments
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table stock_movements enable row level security;
alter table stock_movements force row level security;
create policy tenant_isolation on stock_movements
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

alter table audit_log enable row level security;
alter table audit_log force row level security;
create policy tenant_isolation on audit_log
  using (tenant_id = (select app_current_tenant()))
  with check (tenant_id = (select app_current_tenant()));

-- Pre-tenant lookups (D-024): the auth.* SECURITY DEFINER functions run as
-- zuru_owner, which FORCE RLS would otherwise restrict to zero rows. These
-- SELECT-only policies apply to zuru_owner alone; zuru_app is never a member of it.
create policy auth_definer_lookup on users for select to zuru_owner using (true);
create policy auth_definer_lookup on sessions for select to zuru_owner using (true);
create policy auth_definer_lookup on devices for select to zuru_owner using (true);
create policy auth_definer_lookup on password_resets for select to zuru_owner using (true);

-- updated_at maintenance (SPEC §4).
create trigger set_updated_at before update on tenants for each row execute function set_updated_at();
create trigger set_updated_at before update on users for each row execute function set_updated_at();
create trigger set_updated_at before update on devices for each row execute function set_updated_at();
create trigger set_updated_at before update on sessions for each row execute function set_updated_at();
create trigger set_updated_at before update on pin_attempts for each row execute function set_updated_at();
create trigger set_updated_at before update on password_resets for each row execute function set_updated_at();
create trigger set_updated_at before update on categories for each row execute function set_updated_at();
create trigger set_updated_at before update on items for each row execute function set_updated_at();
create trigger set_updated_at before update on modifier_groups for each row execute function set_updated_at();
create trigger set_updated_at before update on modifier_options for each row execute function set_updated_at();
create trigger set_updated_at before update on item_modifier_groups for each row execute function set_updated_at();
create trigger set_updated_at before update on ingredients for each row execute function set_updated_at();
create trigger set_updated_at before update on recipe_lines for each row execute function set_updated_at();
create trigger set_updated_at before update on modifier_option_effects for each row execute function set_updated_at();
create trigger set_updated_at before update on discounts for each row execute function set_updated_at();
create trigger set_updated_at before update on order_counters for each row execute function set_updated_at();
create trigger set_updated_at before update on orders for each row execute function set_updated_at();
create trigger set_updated_at before update on order_lines for each row execute function set_updated_at();
create trigger set_updated_at before update on order_line_modifiers for each row execute function set_updated_at();
create trigger set_updated_at before update on payments for each row execute function set_updated_at();
create trigger set_updated_at before update on stock_movements for each row execute function set_updated_at();
create trigger set_updated_at before update on audit_log for each row execute function set_updated_at();
create trigger set_updated_at before update on outbox for each row execute function set_updated_at();

-- migrate:down
drop trigger set_updated_at on tenants;
drop trigger set_updated_at on users;
drop trigger set_updated_at on devices;
drop trigger set_updated_at on sessions;
drop trigger set_updated_at on pin_attempts;
drop trigger set_updated_at on password_resets;
drop trigger set_updated_at on categories;
drop trigger set_updated_at on items;
drop trigger set_updated_at on modifier_groups;
drop trigger set_updated_at on modifier_options;
drop trigger set_updated_at on item_modifier_groups;
drop trigger set_updated_at on ingredients;
drop trigger set_updated_at on recipe_lines;
drop trigger set_updated_at on modifier_option_effects;
drop trigger set_updated_at on discounts;
drop trigger set_updated_at on order_counters;
drop trigger set_updated_at on orders;
drop trigger set_updated_at on order_lines;
drop trigger set_updated_at on order_line_modifiers;
drop trigger set_updated_at on payments;
drop trigger set_updated_at on stock_movements;
drop trigger set_updated_at on audit_log;
drop trigger set_updated_at on outbox;
drop policy auth_definer_lookup on users;
drop policy auth_definer_lookup on sessions;
drop policy auth_definer_lookup on devices;
drop policy auth_definer_lookup on password_resets;
drop policy tenant_isolation on tenants;
alter table tenants no force row level security;
alter table tenants disable row level security;
drop policy tenant_isolation on users;
alter table users no force row level security;
alter table users disable row level security;
drop policy tenant_isolation on devices;
alter table devices no force row level security;
alter table devices disable row level security;
drop policy tenant_isolation on sessions;
alter table sessions no force row level security;
alter table sessions disable row level security;
drop policy tenant_isolation on pin_attempts;
alter table pin_attempts no force row level security;
alter table pin_attempts disable row level security;
drop policy tenant_isolation on password_resets;
alter table password_resets no force row level security;
alter table password_resets disable row level security;
drop policy tenant_isolation on categories;
alter table categories no force row level security;
alter table categories disable row level security;
drop policy tenant_isolation on items;
alter table items no force row level security;
alter table items disable row level security;
drop policy tenant_isolation on modifier_groups;
alter table modifier_groups no force row level security;
alter table modifier_groups disable row level security;
drop policy tenant_isolation on modifier_options;
alter table modifier_options no force row level security;
alter table modifier_options disable row level security;
drop policy tenant_isolation on item_modifier_groups;
alter table item_modifier_groups no force row level security;
alter table item_modifier_groups disable row level security;
drop policy tenant_isolation on ingredients;
alter table ingredients no force row level security;
alter table ingredients disable row level security;
drop policy tenant_isolation on recipe_lines;
alter table recipe_lines no force row level security;
alter table recipe_lines disable row level security;
drop policy tenant_isolation on modifier_option_effects;
alter table modifier_option_effects no force row level security;
alter table modifier_option_effects disable row level security;
drop policy tenant_isolation on discounts;
alter table discounts no force row level security;
alter table discounts disable row level security;
drop policy tenant_isolation on order_counters;
alter table order_counters no force row level security;
alter table order_counters disable row level security;
drop policy tenant_isolation on orders;
alter table orders no force row level security;
alter table orders disable row level security;
drop policy tenant_isolation on order_lines;
alter table order_lines no force row level security;
alter table order_lines disable row level security;
drop policy tenant_isolation on order_line_modifiers;
alter table order_line_modifiers no force row level security;
alter table order_line_modifiers disable row level security;
drop policy tenant_isolation on payments;
alter table payments no force row level security;
alter table payments disable row level security;
drop policy tenant_isolation on stock_movements;
alter table stock_movements no force row level security;
alter table stock_movements disable row level security;
drop policy tenant_isolation on audit_log;
alter table audit_log no force row level security;
alter table audit_log disable row level security;
