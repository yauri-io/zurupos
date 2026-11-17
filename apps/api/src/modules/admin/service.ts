import type { AuthContext } from '../../auth/context.js'
import type { Tx } from '../../db/with-tenant.js'
import { formatQty, parseQty } from '../../domain/decimal.js'
import * as q from './queries.js'

export const stockInvariant = async (trx: Tx, auth: AuthContext) => ({
  mismatches: (await q.stockMismatches(trx, auth.tenantId)).map((r) => ({
    ingredient_id: r.id,
    name: r.name,
    stock_qty: formatQty(parseQty(r.stock_qty)),
    movements_total: formatQty(parseQty(r.movements_total)),
  })),
})
