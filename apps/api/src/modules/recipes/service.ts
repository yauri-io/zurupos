import { writeAudit } from '../../audit/audit.js'
import type { AuthContext } from '../../auth/context.js'
import type { Tx } from '../../db/with-tenant.js'
import { formatQty, parseQty } from '../../domain/decimal.js'
import { resolveIngredients, type Effect, type SelectedOption } from '../../domain/recipe-resolve.js'
import { apiError } from '../../http/errors.js'
import { findItem } from '../items/queries.js'
import * as q from './queries.js'

type BaseUnit = 'g' | 'ml' | 'pcs'
type EffectKind = 'add' | 'remove' | 'replace'
type EffectInput = {
  effect: EffectKind
  ingredient_id: string
  target_ingredient_id?: string | null
  qty?: string | null
}

const qty = (value: string) => formatQty(parseQty(value))

const loadItem = async (trx: Tx, auth: AuthContext, itemId: string, forUpdate: boolean) => {
  const item = await findItem(trx, auth.tenantId, itemId, { forUpdate })
  if (!item) throw apiError('NOT_FOUND')
  return item
}

// New references must point at live ingredients; ones already in use may stay
// even if archived since, so saving an unchanged recipe never fails (D-029).
const assertIngredients = async (trx: Tx, auth: AuthContext, ids: string[], alreadyUsed: Set<string>) => {
  const fresh = [...new Set(ids)].filter((id) => !alreadyUsed.has(id))
  const live = await q.liveIngredientIds(trx, auth.tenantId, fresh)
  if (fresh.some((id) => !live.has(id))) throw apiError('NOT_FOUND')
}

export const getRecipe = async (trx: Tx, auth: AuthContext, itemId: string) => {
  await loadItem(trx, auth, itemId, false)
  const lines = await q.recipeLines(trx, auth.tenantId, [itemId])
  return {
    item_id: itemId,
    lines: lines.map((l) => ({
      ingredient_id: l.ingredient_id,
      ingredient_name: l.ingredient_name,
      base_unit: l.base_unit as BaseUnit,
      ingredient_archived: l.ingredient_archived_at !== null,
      qty: qty(l.qty),
    })),
  }
}

export const putRecipe = async (
  trx: Tx,
  auth: AuthContext,
  itemId: string,
  lines: { ingredient_id: string; qty: string }[],
) => {
  await loadItem(trx, auth, itemId, true)
  const ids = lines.map((l) => l.ingredient_id)
  if (new Set(ids).size !== ids.length) {
    throw apiError('VALIDATION', { field: 'lines', problem: 'duplicate_ingredient' })
  }
  if (lines.some((l) => parseQty(l.qty) <= 0n)) {
    throw apiError('VALIDATION', { field: 'qty', problem: 'must_be_positive' })
  }
  const before = await q.recipeLines(trx, auth.tenantId, [itemId])
  await assertIngredients(trx, auth, ids, new Set(before.map((l) => l.ingredient_id)))
  await q.replaceRecipe(trx, auth.tenantId, itemId, lines)
  await writeAudit(trx, {
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: 'recipe.change',
    entityType: 'item',
    entityId: itemId,
    data: {
      before: before.map((l) => ({ ingredient_id: l.ingredient_id, qty: qty(l.qty) })),
      after: lines.map((l) => ({ ingredient_id: l.ingredient_id, qty: qty(l.qty) })),
    },
  })
  return getRecipe(trx, auth, itemId)
}

const loadOption = async (trx: Tx, auth: AuthContext, optionId: string) => {
  const option = await q.findLiveOptionForUpdate(trx, auth.tenantId, optionId)
  if (!option) throw apiError('NOT_FOUND')
}

export const getEffects = async (trx: Tx, auth: AuthContext, optionId: string) => {
  await loadOption(trx, auth, optionId)
  const effects = await q.optionEffects(trx, auth.tenantId, [optionId])
  return {
    option_id: optionId,
    effects: effects.map((e) => ({
      effect: e.effect as EffectKind,
      ingredient_id: e.ingredient_id,
      ingredient_name: e.ingredient_name,
      base_unit: e.base_unit as BaseUnit,
      ingredient_archived: e.ingredient_archived_at !== null,
      target_ingredient_id: e.target_ingredient_id,
      target_ingredient_name: e.target_ingredient_name,
      qty: e.qty === null ? null : qty(e.qty),
    })),
  }
}

// Mirrors the DB CHECK (SPEC §4.1, D-027) so the dashboard gets a precise error.
const normaliseEffect = (e: EffectInput) => {
  const target = e.target_ingredient_id ?? null
  const amount = e.qty ?? null
  const fail = (problem: string) => apiError('VALIDATION', { field: 'effects', problem })
  if (amount !== null && parseQty(amount) <= 0n) throw fail('qty_must_be_positive')
  if (e.effect === 'add') {
    if (target !== null) throw fail('add_has_no_target')
    if (amount === null) throw fail('add_needs_qty')
  }
  if (e.effect === 'remove' && (target !== null || amount !== null))
    throw fail('remove_takes_ingredient_only')
  if (e.effect === 'replace') {
    if (target === null) throw fail('replace_needs_target')
    if (target === e.ingredient_id && amount === null) throw fail('replace_same_ingredient_needs_qty')
  }
  return { effect: e.effect, ingredient_id: e.ingredient_id, target_ingredient_id: target, qty: amount }
}

export const putEffects = async (trx: Tx, auth: AuthContext, optionId: string, input: EffectInput[]) => {
  await loadOption(trx, auth, optionId)
  const effects = input.map(normaliseEffect)
  const before = await q.optionEffects(trx, auth.tenantId, [optionId])
  const used = new Set(before.flatMap((e) => [e.ingredient_id, e.target_ingredient_id ?? '']))
  await assertIngredients(
    trx,
    auth,
    effects.flatMap((e) => [e.ingredient_id, ...(e.target_ingredient_id ? [e.target_ingredient_id] : [])]),
    used,
  )
  await q.replaceEffects(trx, auth.tenantId, optionId, effects)
  await writeAudit(trx, {
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: 'option_effects.change',
    entityType: 'modifier_option',
    entityId: optionId,
    data: { after: effects },
  })
  return getEffects(trx, auth, optionId)
}

const toEffect = (e: Awaited<ReturnType<typeof q.optionEffects>>[number]): Effect => {
  if (e.effect === 'add') {
    if (e.qty === null) throw new Error('add effect without qty')
    return { effect: 'add', ingredientId: e.ingredient_id, qty: parseQty(e.qty), sort: e.sort }
  }
  if (e.effect === 'remove') return { effect: 'remove', ingredientId: e.ingredient_id, sort: e.sort }
  if (e.target_ingredient_id === null) throw new Error('replace effect without target')
  return {
    effect: 'replace',
    ingredientId: e.ingredient_id,
    targetIngredientId: e.target_ingredient_id,
    qty: e.qty === null ? null : parseQty(e.qty),
    sort: e.sort,
  }
}

// Loads the recipe and the selected options' effects for one item and resolves
// them (SPEC §7.1). Shared by the recipe preview and order completion (M3).
// Options must be live and belong to a group attached to the item.
export const resolveLine = async (
  trx: Tx,
  tenantId: string,
  itemId: string,
  optionIds: readonly string[],
  lineQty: number,
) => {
  const options = await q.optionsOnItem(trx, tenantId, itemId, optionIds)
  if (options.length !== new Set(optionIds).size) throw apiError('NOT_FOUND')
  if (options.some((o) => o.link_sort === null)) {
    throw apiError('VALIDATION', { field: 'option_ids', problem: 'option_not_on_item' })
  }
  // Rank groups by (item link sort, group sort, group id) so the order is total.
  const groupRank = new Map(
    [...new Map(options.map((o) => [o.group_id, o])).values()]
      .sort(
        (a, b) =>
          (a.link_sort ?? 0) - (b.link_sort ?? 0) ||
          a.group_sort - b.group_sort ||
          a.group_id.localeCompare(b.group_id),
      )
      .map((o, rank) => [o.group_id, rank]),
  )
  const effects = await q.optionEffects(trx, tenantId, optionIds)
  const selected: SelectedOption[] = options.map((o) => ({
    groupSort: groupRank.get(o.group_id) ?? 0,
    optionSort: o.option_sort,
    effects: effects.filter((e) => e.option_id === o.id).map(toEffect),
  }))
  const recipe = (await q.recipeLines(trx, tenantId, [itemId])).map((l) => ({
    ingredientId: l.ingredient_id,
    qty: parseQty(l.qty),
  }))
  return resolveIngredients(recipe, selected, lineQty)
}

export const preview = async (
  trx: Tx,
  auth: AuthContext,
  input: { item_id: string; option_ids: string[]; qty?: number },
) => {
  await loadItem(trx, auth, input.item_id, false)
  const lineQty = input.qty ?? 1
  const resolved = await resolveLine(trx, auth.tenantId, input.item_id, input.option_ids, lineQty)
  const names = new Map<string, { name: string; base_unit: string }>()
  for (const l of await q.recipeLines(trx, auth.tenantId, [input.item_id])) {
    names.set(l.ingredient_id, { name: l.ingredient_name, base_unit: l.base_unit })
  }
  for (const e of await q.optionEffects(trx, auth.tenantId, input.option_ids)) {
    names.set(e.ingredient_id, { name: e.ingredient_name, base_unit: e.base_unit })
  }
  return {
    item_id: input.item_id,
    qty: lineQty,
    ingredients: [...resolved]
      .map(([id, amount]) => ({
        ingredient_id: id,
        ingredient_name: names.get(id)?.name ?? '',
        base_unit: (names.get(id)?.base_unit ?? 'pcs') as BaseUnit,
        qty: formatQty(amount),
      }))
      .sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name)),
  }
}
