import { sql } from 'kysely'
import type { Tx } from '../../db/with-tenant.js'

export const stockMismatches = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('ingredients as i')
    .leftJoin(
      (eb) =>
        eb
          .selectFrom('stock_movements')
          .select(['ingredient_id', sql<string>`sum(qty_delta)`.as('total')])
          .where('tenant_id', '=', tenantId)
          .groupBy('ingredient_id')
          .as('m'),
      (j) => j.onRef('m.ingredient_id', '=', 'i.id'),
    )
    .select(['i.id', 'i.name', 'i.stock_qty', sql<string>`coalesce(m.total, 0)`.as('movements_total')])
    .where('i.tenant_id', '=', tenantId)
    .where(sql<boolean>`i.stock_qty <> coalesce(m.total, 0)`)
    .orderBy('i.name')
    .execute()
