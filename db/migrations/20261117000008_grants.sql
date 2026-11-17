-- migrate:up

-- zuru_app: SELECT, INSERT, UPDATE on tenant tables; DELETE only where listed (D-015).
-- Append-only tables get SELECT + INSERT. No sequences exist (uuid keys).
grant select, insert, update on tenants, users, devices, sessions, pin_attempts, password_resets, categories, items, modifier_groups, modifier_options, item_modifier_groups, ingredients, recipe_lines, modifier_option_effects, discounts, order_counters, orders, order_lines, order_line_modifiers, payments to zuru_app;
grant select, insert on stock_movements, audit_log to zuru_app;
grant delete on item_modifier_groups, recipe_lines, modifier_option_effects to zuru_app;

-- outbox is a system table (SPEC §3.5).
grant insert on outbox to zuru_app;
grant select, update on outbox to zuru_worker;

-- migrate:down
revoke all on tenants, users, devices, sessions, pin_attempts, password_resets, categories, items, modifier_groups, modifier_options, item_modifier_groups, ingredients, recipe_lines, modifier_option_effects, discounts, order_counters, orders, order_lines, order_line_modifiers, payments, stock_movements, audit_log, outbox from zuru_app, zuru_worker;
