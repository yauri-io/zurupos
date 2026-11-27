import { writeAudit } from '../../audit/audit.js'
import type { AuthContext } from '../../auth/context.js'
import type { Tx } from '../../db/with-tenant.js'
import { apiError } from '../../http/errors.js'
import { money } from '../../http/serialize.js'
import type { MediaStore } from '../../media/store.js'
import { presentImg } from '../../media/variants.js'
import { countRecommended, lockProfile } from '../online-menu/queries.js'
import { RECOMMENDED_LIMIT } from '../online-menu/schemas.js'
import * as q from './queries.js'

type ItemInput = {
  category_id?: string
  name?: string
  price?: number
  color?: string
  sort?: number
  is_active?: boolean
  is_available?: boolean
  show_online?: boolean
  is_recommended?: boolean
}

// The media store turns a photo's storage key into URLs (SPEC §12.7).
export type ItemDeps = { store: MediaStore }

const withGroups = async (trx: Tx, tenantId: string, deps: ItemDeps, items: q.ItemRow[]) => {
  const ids = items.map((i) => i.id)
  const photoIds = items.map((i) => i.photo_media_id).filter((id): id is string => id !== null)
  const [links, photos] = await Promise.all([
    q.groupLinks(trx, tenantId, ids),
    q.photoMedia(trx, tenantId, photoIds),
  ])
  const photoById = new Map(photos.map((p) => [p.id, p]))
  return items.map(({ photo_media_id, ...item }) => ({
    ...item,
    price: money(item.price),
    modifier_group_ids: links.filter((l) => l.item_id === item.id).map((l) => l.group_id),
    photo: presentImg(deps.store, photo_media_id ? (photoById.get(photo_media_id) ?? null) : null),
  }))
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

export const listItems = async (
  trx: Tx,
  auth: AuthContext,
  deps: ItemDeps,
  categoryId: string | undefined,
) => ({
  items: await withGroups(trx, auth.tenantId, deps, await q.listItems(trx, auth.tenantId, categoryId)),
})

export const getItem = async (trx: Tx, auth: AuthContext, deps: ItemDeps, id: string) => {
  const [item] = await withGroups(trx, auth.tenantId, deps, [await load(trx, auth, id, false)])
  if (!item) throw apiError('NOT_FOUND')
  return item
}

// At most RECOMMENDED_LIMIT non-archived recommended items (SPEC §12.7). Checked
// while holding the shop's menu_profiles lock, so of two parallel requests for
// the last place exactly one wins.
const assertRecommendedRoom = async (trx: Tx, auth: AuthContext, itemId: string) => {
  await lockProfile(trx, auth.tenantId)
  if ((await countRecommended(trx, auth.tenantId, itemId)) >= RECOMMENDED_LIMIT) {
    throw apiError('CONFLICT', {
      field: 'is_recommended',
      reason: 'recommended_limit',
      limit: RECOMMENDED_LIMIT,
    })
  }
}

export const createItem = async (
  trx: Tx,
  auth: AuthContext,
  deps: ItemDeps,
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
  return getItem(trx, auth, deps, item.id)
}

export const updateItem = async (
  trx: Tx,
  auth: AuthContext,
  deps: ItemDeps,
  id: string,
  input: ItemInput,
) => {
  // The profile lock (when needed) is taken before the item lock, in the same
  // order as every other online-menu write.
  if (input.is_recommended === true) await assertRecommendedRoom(trx, auth, id)
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
  return getItem(trx, auth, deps, id)
}

export const setAvailability = async (
  trx: Tx,
  auth: AuthContext,
  deps: ItemDeps,
  id: string,
  isAvailable: boolean,
) => {
  await load(trx, auth, id)
  await q.updateItem(trx, auth.tenantId, id, { is_available: isAvailable })
  return getItem(trx, auth, deps, id)
}

export const setModifierGroups = async (
  trx: Tx,
  auth: AuthContext,
  deps: ItemDeps,
  id: string,
  groupIds: string[],
) => {
  await load(trx, auth, id)
  const live = new Set(await q.liveGroupIds(trx, auth.tenantId, groupIds))
  if (groupIds.some((g) => !live.has(g))) throw apiError('NOT_FOUND')
  await q.replaceGroupLinks(trx, auth.tenantId, id, groupIds)
  return getItem(trx, auth, deps, id)
}

// D-029: archived items leave the POS grid; order history keeps its snapshots.
export const archiveItem = async (trx: Tx, auth: AuthContext, id: string) => {
  await load(trx, auth, id)
  await q.updateItem(trx, auth.tenantId, id, { archived_at: new Date() })
}
