import type { Tx } from '../../db/with-tenant.js'
import { sql } from 'kysely'
import { cursorTimestamp, type Cursor } from '../../http/cursor.js'

const COLUMNS = [
  'id',
  'name',
  'base_unit',
  'stock_qty',
  'low_stock_threshold',
  'avg_cost',
  'purchase_unit_name',
  'purchase_unit_size',
  'archived_at',
] as const

export type IngredientRow = {
  id: string
  name: string
  base_unit: string
  stock_qty: string
  low_stock_threshold: string
  avg_cost: string
  purchase_unit_name: string | null
  purchase_unit_size: string | null
  archived_at: Date | null
}

export const listIngredients = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('ingredients')
    .select(COLUMNS)
    .where('tenant_id', '=', tenantId)
    .where('archived_at', 'is', null)
    .orderBy('name')
    .execute()

// Archived ingredients stay readable: history and old recipes still point at them.
export const findIngredient = (trx: Tx, tenantId: string, id: string, opts: { forUpdate?: boolean } = {}) => {
  const query = trx
    .selectFrom('ingredients')
    .select(COLUMNS)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
  return (opts.forUpdate ? query.forUpdate() : query).executeTakeFirst()
}

export const insertIngredient = (
  trx: Tx,
  row: {
    tenant_id: string
    name: string
    base_unit: string
    low_stock_threshold?: string
    purchase_unit_name?: string | null
    purchase_unit_size?: string | null
  },
) => trx.insertInto('ingredients').values(row).returning(COLUMNS).executeTakeFirstOrThrow()

// Never touches stock_qty or avg_cost: those change only with a stock movement (SPEC §7.4).
export const updateIngredient = (
  trx: Tx,
  tenantId: string,
  id: string,
  patch: {
    name?: string
    low_stock_threshold?: string
    purchase_unit_name?: string | null
    purchase_unit_size?: string | null
    archived_at?: Date
  },
) =>
  trx
    .updateTable('ingredients')
    .set(patch)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .returning(COLUMNS)
    .executeTakeFirstOrThrow()

export const listMovements = (
  trx: Tx,
  tenantId: string,
  ingredientId: string,
  cursor: Cursor | null,
  limit: number,
) => {
  let query = trx
    .selectFrom('stock_movements as m')
    .innerJoin('users as u', (j) =>
      j.onRef('u.tenant_id', '=', 'm.tenant_id').onRef('u.id', '=', 'm.created_by_user_id'),
    )
    .select([
      'm.id',
      'm.type',
      'm.qty_delta',
      'm.balance_after',
      'm.order_id',
      'm.reason',
      'm.counted_qty',
      'm.unit_cost',
      'm.total_cost',
      'm.created_at',
      'u.id as user_id',
      'u.name as user_name',
      cursorTimestamp('m.created_at').as('cursor_at'),
    ])
    .where('m.tenant_id', '=', tenantId)
    .where('m.ingredient_id', '=', ingredientId)
  if (cursor) {
    query = query.where((eb) =>
      eb.or([
        eb('m.created_at', '<', sql<Date>`${cursor.createdAt}::timestamptz`),
        eb.and([
          eb('m.created_at', '=', sql<Date>`${cursor.createdAt}::timestamptz`),
          eb('m.id', '<', cursor.id),
        ]),
      ]),
    )
  }
  return query.orderBy('m.created_at', 'desc').orderBy('m.id', 'desc').limit(limit).execute()
}
