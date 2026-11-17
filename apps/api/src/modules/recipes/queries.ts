import type { Tx } from '../../db/with-tenant.js'

export const recipeLines = (trx: Tx, tenantId: string, itemIds: readonly string[]) =>
  itemIds.length === 0
    ? Promise.resolve([])
    : trx
        .selectFrom('recipe_lines as r')
        .innerJoin('ingredients as i', (j) =>
          j.onRef('i.tenant_id', '=', 'r.tenant_id').onRef('i.id', '=', 'r.ingredient_id'),
        )
        .select([
          'r.item_id',
          'r.ingredient_id',
          'r.qty',
          'i.name as ingredient_name',
          'i.base_unit',
          'i.archived_at as ingredient_archived_at',
        ])
        .where('r.tenant_id', '=', tenantId)
        .where('r.item_id', 'in', itemIds)
        .orderBy('i.name')
        .execute()

export const replaceRecipe = async (
  trx: Tx,
  tenantId: string,
  itemId: string,
  lines: readonly { ingredient_id: string; qty: string }[],
) => {
  await trx
    .deleteFrom('recipe_lines')
    .where('tenant_id', '=', tenantId)
    .where('item_id', '=', itemId)
    .execute()
  if (lines.length === 0) return
  await trx
    .insertInto('recipe_lines')
    .values(lines.map((l) => ({ tenant_id: tenantId, item_id: itemId, ...l })))
    .execute()
}

export const optionEffects = (trx: Tx, tenantId: string, optionIds: readonly string[]) =>
  optionIds.length === 0
    ? Promise.resolve([])
    : trx
        .selectFrom('modifier_option_effects as e')
        .innerJoin('ingredients as i', (j) =>
          j.onRef('i.tenant_id', '=', 'e.tenant_id').onRef('i.id', '=', 'e.ingredient_id'),
        )
        .leftJoin('ingredients as t', (j) =>
          j.onRef('t.tenant_id', '=', 'e.tenant_id').onRef('t.id', '=', 'e.target_ingredient_id'),
        )
        .select([
          'e.option_id',
          'e.effect',
          'e.ingredient_id',
          'e.target_ingredient_id',
          'e.qty',
          'e.sort',
          'i.name as ingredient_name',
          'i.base_unit',
          'i.archived_at as ingredient_archived_at',
          't.name as target_ingredient_name',
        ])
        .where('e.tenant_id', '=', tenantId)
        .where('e.option_id', 'in', optionIds)
        .orderBy('e.sort')
        .execute()

export const replaceEffects = async (
  trx: Tx,
  tenantId: string,
  optionId: string,
  effects: readonly {
    effect: string
    ingredient_id: string
    target_ingredient_id: string | null
    qty: string | null
  }[],
) => {
  await trx
    .deleteFrom('modifier_option_effects')
    .where('tenant_id', '=', tenantId)
    .where('option_id', '=', optionId)
    .execute()
  if (effects.length === 0) return
  await trx
    .insertInto('modifier_option_effects')
    .values(effects.map((e, sort) => ({ tenant_id: tenantId, option_id: optionId, sort, ...e })))
    .execute()
}

export const findLiveOptionForUpdate = (trx: Tx, tenantId: string, id: string) =>
  trx
    .selectFrom('modifier_options as o')
    .innerJoin('modifier_groups as g', (j) =>
      j.onRef('g.tenant_id', '=', 'o.tenant_id').onRef('g.id', '=', 'o.group_id'),
    )
    .select(['o.id'])
    .where('o.tenant_id', '=', tenantId)
    .where('o.id', '=', id)
    .where('o.archived_at', 'is', null)
    .where('g.archived_at', 'is', null)
    .forUpdate('o')
    .executeTakeFirst()

export const liveIngredientIds = async (trx: Tx, tenantId: string, ids: readonly string[]) =>
  ids.length === 0
    ? new Set<string>()
    : new Set(
        (
          await trx
            .selectFrom('ingredients')
            .select('id')
            .where('tenant_id', '=', tenantId)
            .where('id', 'in', ids)
            .where('archived_at', 'is', null)
            .execute()
        ).map((r) => r.id),
      )

// Live options with where they sit on this item: the item's group order first,
// then the group's own sort, then the option's sort (SPEC §7.1 step 2, D-033).
// link_sort is null when the option's group isn't attached to the item.
export const optionsOnItem = (trx: Tx, tenantId: string, itemId: string, optionIds: readonly string[]) =>
  optionIds.length === 0
    ? Promise.resolve([])
    : trx
        .selectFrom('modifier_options as o')
        .innerJoin('modifier_groups as g', (j) =>
          j.onRef('g.tenant_id', '=', 'o.tenant_id').onRef('g.id', '=', 'o.group_id'),
        )
        .leftJoin('item_modifier_groups as l', (j) =>
          j
            .onRef('l.tenant_id', '=', 'o.tenant_id')
            .onRef('l.group_id', '=', 'o.group_id')
            .on('l.item_id', '=', itemId),
        )
        .select([
          'o.id',
          'o.sort as option_sort',
          'o.group_id',
          'g.sort as group_sort',
          'l.sort as link_sort',
        ])
        .where('o.tenant_id', '=', tenantId)
        .where('o.id', 'in', optionIds)
        .where('o.archived_at', 'is', null)
        .where('g.archived_at', 'is', null)
        .execute()
