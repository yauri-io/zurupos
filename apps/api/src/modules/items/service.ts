import { writeAudit } from '../../audit/audit.js'
import type { AuthContext } from '../../auth/context.js'
import type { Tx } from '../../db/with-tenant.js'
import { apiError } from '../../http/errors.js'
import { money } from '../../http/serialize.js'
import * as q from './queries.js'

type ItemInput = {
  category_id?: string
  name?: string
  price?: number
  color?: string
  sort?: number
  is_active?: boolean
  is_available?: boolean
}

const toResponse = (item: q.ItemRow, groupIds: string[]) => ({
  ...item,
  price: money(item.price),
  modifier_group_ids: groupIds,
})

const withGroups = async (trx: Tx, tenantId: string, items: q.ItemRow[]) => {
  const links = await q.groupLinks(
    trx,
    tenantId,
    items.map((i) => i.id),
  )
  return items.map((item) =>
    toResponse(
      item,
      links.filter((l) => l.item_id === item.id).map((l) => l.group_id),
    ),
  )
}

const load = async (trx: Tx, auth: AuthContext, id: string, forUpdate = true) => {
  const item = await q.findItem(trx, auth.tenantId, id, { forUpdate })
  if (!item) throw apiError('NOT_FOUND')
  return item
}

const assertCategory = async (trx: Tx, auth: AuthContext, categoryId: string) => {
  if (!(await q.liveCategoryExists(trx, auth.tenantId, categoryId))) throw apiError('NOT_FOUND')
}

const toPatch = (input: ItemInput) => {
  const { price, ...rest } = input
  return { ...rest, ...(price !== undefined ? { price: BigInt(price) } : {}) }
}

export const listItems = async (trx: Tx, auth: AuthContext, categoryId: string | undefined) => ({
  items: await withGroups(trx, auth.tenantId, await q.listItems(trx, auth.tenantId, categoryId)),
})

export const getItem = async (trx: Tx, auth: AuthContext, id: string) => {
  const [item] = await withGroups(trx, auth.tenantId, [await load(trx, auth, id, false)])
  if (!item) throw apiError('NOT_FOUND')
  return item
}

export const createItem = async (
  trx: Tx,
  auth: AuthContext,
  input: ItemInput & { category_id: string; name: string; price: number },
) => {
  await assertCategory(trx, auth, input.category_id)
  const item = await q.insertItem(trx, {
    ...toPatch(input),
    tenant_id: auth.tenantId,
    category_id: input.category_id,
    name: input.name,
    price: BigInt(input.price),
  })
  return toResponse(item, [])
}

export const updateItem = async (trx: Tx, auth: AuthContext, id: string, input: ItemInput) => {
  const current = await load(trx, auth, id)
  if (input.category_id !== undefined && input.category_id !== current.category_id) {
    await assertCategory(trx, auth, input.category_id)
  }
  const patch = toPatch(input)
  const updated = Object.keys(patch).length > 0 ? await q.updateItem(trx, auth.tenantId, id, patch) : current
  if (updated.price !== current.price) {
    await writeAudit(trx, {
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: 'menu.price_change',
      entityType: 'item',
      entityId: id,
      data: { from: money(current.price), to: money(updated.price) },
    })
  }
  return getItem(trx, auth, id)
}

export const setAvailability = async (trx: Tx, auth: AuthContext, id: string, isAvailable: boolean) => {
  await load(trx, auth, id)
  await q.updateItem(trx, auth.tenantId, id, { is_available: isAvailable })
  return getItem(trx, auth, id)
}

export const setModifierGroups = async (trx: Tx, auth: AuthContext, id: string, groupIds: string[]) => {
  await load(trx, auth, id)
  const live = new Set(await q.liveGroupIds(trx, auth.tenantId, groupIds))
  if (groupIds.some((g) => !live.has(g))) throw apiError('NOT_FOUND')
  await q.replaceGroupLinks(trx, auth.tenantId, id, groupIds)
  return getItem(trx, auth, id)
}

// D-029: archived items leave the POS grid; order history keeps its snapshots.
export const archiveItem = async (trx: Tx, auth: AuthContext, id: string) => {
  await load(trx, auth, id)
  await q.updateItem(trx, auth.tenantId, id, { archived_at: new Date() })
}
