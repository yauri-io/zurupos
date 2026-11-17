import { Type } from 'typebox'
import { SignedQty, Uuid } from '../../http/schemas.js'

export const StockInvariantResponse = Type.Object({
  // Ingredients whose stock_qty differs from the sum of their movements. Always empty
  // unless something changed stock outside src/stock/ledger.ts (SPEC §7.4).
  mismatches: Type.Array(
    Type.Object({
      ingredient_id: Uuid,
      name: Type.String(),
      stock_qty: SignedQty,
      movements_total: SignedQty,
    }),
  ),
})
