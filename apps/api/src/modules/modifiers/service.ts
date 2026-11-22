import type { AuthContext } from '../../auth/context.js'
import type { Tx } from '../../db/with-tenant.js'
import { apiError } from '../../http/errors.js'
import { money } from '../../http/serialize.js'
import * as q from './queries.js'

type Selection = 'single' | 'multiple'
type GroupInput = {
  name?: string
  selection?: Selection
  min_select?: number
  max_select?: number
  sort?: number
}
type OptionInput = {
  name?: string
  price_delta?: number
  is_default?: boolean
  sort?: number
  is_active?: boolean
}

const toOption = (o: q.OptionRow) => ({ ...o, price_delta: money(o.price_delta) })

const toGroup = (g: q.GroupRow, options: q.OptionRow[]) => ({
  ...g,
  selection: g.selection === 'single' ? ('single' as const) : ('multiple' as const),
  required: g.min_select >= 1,
  options: options.filter((o) => o.group_id === g.id).map(toOption),
})

// SPEC §4.1: 0 ≤ min ≤ max; single ⇒ max = 1.
const assertRules = (selection: Selection, min: number, max: number) => {
  if (max < 1) throw apiError('VALIDATION', { field: 'max_select', problem: 'at_least_one' })
  if (min > max) throw apiError('VALIDATION', { field: 'min_select', problem: 'greater_than_max' })
  if (selection === 'single' && max !== 1) {
    throw apiError('VALIDATION', { field: 'max_select', problem: 'single_select_max_one' })
  }
}

const loadGroup = async (trx: Tx, auth: AuthContext, id: string) => {
  const group = await q.findGroupForUpdate(trx, auth.tenantId, id)
  if (!group) throw apiError('NOT_FOUND')
  return group
}

const groupResponse = async (trx: Tx, auth: AuthContext, group: q.GroupRow) =>
  toGroup(group, await q.listOptions(trx, auth.tenantId, [group.id]))

export const listGroups = async (trx: Tx, auth: AuthContext) => {
  const groups = await q.listGroups(trx, auth.tenantId)
  const options = await q.listOptions(
    trx,
    auth.tenantId,
    groups.map((g) => g.id),
  )
  return { groups: groups.map((g) => toGroup(g, options)) }
}

export const createGroup = async (
  trx: Tx,
  auth: AuthContext,
  input: GroupInput & { name: string; selection: Selection },
) => {
  const min = input.min_select ?? 0
  const max = input.max_select ?? (input.selection === 'single' ? 1 : Math.max(1, min))
  assertRules(input.selection, min, max)
  const group = await q.insertGroup(trx, {
    tenant_id: auth.tenantId,
    name: input.name,
    selection: input.selection,
    min_select: min,
    max_select: max,
    ...(input.sort !== undefined ? { sort: input.sort } : {}),
  })
  return toGroup(group, [])
}

export const updateGroup = async (trx: Tx, auth: AuthContext, id: string, input: GroupInput) => {
  const current = await loadGroup(trx, auth, id)
  const selection = input.selection ?? (current.selection as Selection)
  // Switching to single-select defaults max to 1 unless the caller sets it.
  const max = input.max_select ?? (input.selection === 'single' ? 1 : current.max_select)
  const min = input.min_select ?? Math.min(current.min_select, max)
  assertRules(selection, min, max)
  const defaults = (await q.listOptions(trx, auth.tenantId, [id])).filter((o) => o.is_default).length
  if (defaults > max) throw apiError('VALIDATION', { field: 'max_select', problem: 'fewer_than_defaults' })
  const updated = await q.updateGroup(trx, auth.tenantId, id, {
    ...input,
    selection,
    min_select: min,
    max_select: max,
  })
  return groupResponse(trx, auth, updated)
}

// D-029: archiving a group also detaches it from every item.
export const archiveGroup = async (trx: Tx, auth: AuthContext, id: string) => {
  await loadGroup(trx, auth, id)
  await q.detachGroupFromItems(trx, auth.tenantId, id)
  await q.updateGroup(trx, auth.tenantId, id, { archived_at: new Date() })
}

// A single-select group has at most one default: a new default replaces the old.
// A multi-select group can't default to more options than max_select.
const applyDefault = async (trx: Tx, auth: AuthContext, group: q.GroupRow, optionId: string) => {
  if (group.selection === 'single') {
    await q.clearOtherDefaults(trx, auth.tenantId, group.id, optionId)
    return
  }
  const others = (await q.listOptions(trx, auth.tenantId, [group.id])).filter(
    (o) => o.is_default && o.id !== optionId,
  ).length
  if (others + 1 > group.max_select) {
    throw apiError('VALIDATION', { field: 'is_default', problem: 'more_defaults_than_max' })
  }
}

const toOptionPatch = (input: OptionInput) => {
  const { price_delta, ...rest } = input
  return { ...rest, ...(price_delta !== undefined ? { price_delta: BigInt(price_delta) } : {}) }
}

export const createOption = async (
  trx: Tx,
  auth: AuthContext,
  input: OptionInput & { group_id: string; name: string },
) => {
  const group = await loadGroup(trx, auth, input.group_id)
  const option = await q.insertOption(trx, {
    ...toOptionPatch(input),
    tenant_id: auth.tenantId,
    group_id: group.id,
    name: input.name,
  })
  if (option.is_default) await applyDefault(trx, auth, group, option.id)
  return toOption(option)
}

const loadOption = async (trx: Tx, auth: AuthContext, id: string) => {
  const option = await q.findOption(trx, auth.tenantId, id)
  if (!option) throw apiError('NOT_FOUND')
  return { option, group: await loadGroup(trx, auth, option.group_id) }
}

export const updateOption = async (trx: Tx, auth: AuthContext, id: string, input: OptionInput) => {
  const { group } = await loadOption(trx, auth, id)
  if (input.is_default === true) await applyDefault(trx, auth, group, id)
  return toOption(await q.updateOption(trx, auth.tenantId, id, toOptionPatch(input)))
}

export const archiveOption = async (trx: Tx, auth: AuthContext, id: string) => {
  await loadOption(trx, auth, id)
  await q.updateOption(trx, auth.tenantId, id, { archived_at: new Date(), is_default: false })
}

// Same limit as PUT /items/:id/modifier-groups (ItemGroupsBody).
const MAX_GROUPS_PER_ITEM = 20

// D-054: choose which items offer this group, from the group's side. Items that
// gain it get it last on their modifier sheet; the others keep their order.
export const setGroupItems = async (trx: Tx, auth: AuthContext, id: string, itemIds: string[]) => {
  await loadGroup(trx, auth, id)
  const wanted = new Set(await q.liveItemIds(trx, auth.tenantId, itemIds))
  if (itemIds.some((i) => !wanted.has(i))) throw apiError('NOT_FOUND')
  const before = new Set(await q.itemsWithGroup(trx, auth.tenantId, id))
  const added = itemIds.filter((i) => !before.has(i))
  const removed = [...before].filter((i) => !wanted.has(i))
  const counts = await q.liveGroupCounts(trx, auth.tenantId, added)
  if (counts.some((c) => Number(c.n) >= MAX_GROUPS_PER_ITEM)) {
    throw apiError('VALIDATION', { field: 'item_ids', problem: 'too_many_groups' })
  }
  await q.removeGroupFromItems(trx, auth.tenantId, id, removed)
  await q.appendGroupToItems(trx, auth.tenantId, id, added)
  return { item_ids: await q.itemsWithGroup(trx, auth.tenantId, id) }
}
