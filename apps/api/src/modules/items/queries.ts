import type { Tx } from '../../db/with-tenant.js'

const COLUMNS = ['id', 'category_id', 'name', 'price', 'color', 'sort', 'is_active', 'is_available'] as const

export type ItemRow = {
  id: string
  category_id: string
  name: string
  price: bigint
  color: string
  sort: number
  is_active: boolean
  is_available: boolean
}

export const listItems = (trx: Tx, tenantId: string, categoryId: string | undefined) => {
  let query = trx
    .selectFrom('items')
    .select(COLUMNS)
    .where('tenant_id', '=', tenantId)
    .where('archived_at', 'is', null)
  if (categoryId !== undefined) query = query.where('category_id', '=', categoryId)
  return query.orderBy('sort').orderBy('name').execute()
}

export const findItem = (trx: Tx, tenantId: string, id: string, opts: { forUpdate?: boolean } = {}) => {
  const query = trx
    .selectFrom('items')
    .select(COLUMNS)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .where('archived_at', 'is', null)
  return (opts.forUpdate ? query.forUpdate() : query).executeTakeFirst()
}

export const insertItem = (
  trx: Tx,
  row: {
    tenant_id: string
    category_id: string
    name: string
    price: bigint
    color?: string
    sort?: number
    is_active?: boolean
    is_available?: boolean
  },
) => trx.insertInto('items').values(row).returning(COLUMNS).executeTakeFirstOrThrow()

export const updateItem = (
  trx: Tx,
  tenantId: string,
  id: string,
  patch: Partial<Omit<ItemRow, 'id'>> & { archived_at?: Date },
) =>
  trx
    .updateTable('items')
    .set(patch)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .returning(COLUMNS)
    .executeTakeFirstOrThrow()

export const liveCategoryExists = async (trx: Tx, tenantId: string, categoryId: string) =>
  (await trx
    .selectFrom('categories')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('id', '=', categoryId)
    .where('archived_at', 'is', null)
    .executeTakeFirst()) !== undefined

export const groupLinks = (trx: Tx, tenantId: string, itemIds: readonly string[]) =>
  itemIds.length === 0
    ? Promise.resolve([])
    : trx
        .selectFrom('item_modifier_groups as l')
        .innerJoin('modifier_groups as g', (j) =>
          j.onRef('g.tenant_id', '=', 'l.tenant_id').onRef('g.id', '=', 'l.group_id'),
        )
        .select(['l.item_id', 'l.group_id'])
        .where('l.tenant_id', '=', tenantId)
        .where('l.item_id', 'in', itemIds)
        .where('g.archived_at', 'is', null)
        .orderBy('l.sort')
        .orderBy('g.sort')
        .execute()

export const liveGroupIds = async (trx: Tx, tenantId: string, ids: readonly string[]) =>
  ids.length === 0
    ? []
    : (
        await trx
          .selectFrom('modifier_groups')
          .select('id')
          .where('tenant_id', '=', tenantId)
          .where('id', 'in', ids)
          .where('archived_at', 'is', null)
          .execute()
      ).map((r) => r.id)

export const replaceGroupLinks = async (
  trx: Tx,
  tenantId: string,
  itemId: string,
  groupIds: readonly string[],
) => {
  await trx
    .deleteFrom('item_modifier_groups')
    .where('tenant_id', '=', tenantId)
    .where('item_id', '=', itemId)
    .execute()
  if (groupIds.length === 0) return
  await trx
    .insertInto('item_modifier_groups')
    .values(groupIds.map((group_id, sort) => ({ tenant_id: tenantId, item_id: itemId, group_id, sort })))
    .execute()
}
