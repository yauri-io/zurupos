-- migrate:up

-- SPEC §7.1's "Less sugar" is `replace aren → aren, qty 10`: a replace may keep the
-- same ingredient when it sets a new quantity (D-027). A same-ingredient replace
-- without a qty would be a no-op, so it stays rejected.
alter table modifier_option_effects drop constraint modifier_option_effects_shape;
alter table modifier_option_effects add constraint modifier_option_effects_shape check (
  (effect = 'add' and target_ingredient_id is null and qty is not null and qty > 0)
  or (effect = 'remove' and target_ingredient_id is null and qty is null)
  or (effect = 'replace' and target_ingredient_id is not null and (qty is null or qty > 0)
      and (target_ingredient_id <> ingredient_id or qty is not null))
);

-- migrate:down
alter table modifier_option_effects drop constraint modifier_option_effects_shape;
alter table modifier_option_effects add constraint modifier_option_effects_shape check (
  (effect = 'add' and target_ingredient_id is null and qty is not null and qty > 0)
  or (effect = 'remove' and target_ingredient_id is null and qty is null)
  or (effect = 'replace' and target_ingredient_id is not null
      and target_ingredient_id <> ingredient_id and (qty is null or qty > 0))
);
