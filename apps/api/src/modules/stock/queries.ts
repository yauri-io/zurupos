import type { Tx } from '../../db/with-tenant.js'

export const findPurchaseUnit = (trx: Tx, tenantId: string, ingredientId: string) =>
  trx
    .selectFrom('ingredients')
    .select(['purchase_unit_size'])
    .where('tenant_id', '=', tenantId)
    .where('id', '=', ingredientId)
    .executeTakeFirst()

export const liveIngredientRows = (trx: Tx, tenantId: string, ids: readonly string[]) =>
  trx
    .selectFrom('ingredients')
    .select([
      'id',
      'name',
      'base_unit',
      'stock_qty',
      'low_stock_threshold',
      'avg_cost',
      'purchase_unit_name',
      'purchase_unit_size',
      'archived_at',
    ])
    .where('tenant_id', '=', tenantId)
    .where('id', 'in', ids)
    .orderBy('name')
    .execute()
