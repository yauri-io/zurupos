import { Type } from 'typebox'
import { Body, Money, Qty, Uuid } from '../../http/schemas.js'
import { IngredientResponse } from '../ingredients/schemas.js'

// Exactly one of qty (base units) or purchase_qty (purchase units) — checked in the service.
export const StockInBody = Body({
  ingredient_id: Uuid,
  qty: Type.Optional(Qty),
  purchase_qty: Type.Optional(Qty),
  // What was paid for the whole quantity, in rupiah.
  total_cost: Money,
})

export const WasteReason = Type.Enum(['spilled', 'expired', 'mistake', 'other'])

export const WasteBody = Body({
  ingredient_id: Uuid,
  qty: Qty,
  reason: WasteReason,
  note: Type.Optional(Type.String({ maxLength: 150 })),
})

export const CountBody = Body({
  counts: Type.Array(Body({ ingredient_id: Uuid, counted_qty: Qty }), { minItems: 1, maxItems: 500 }),
  note: Type.Optional(Type.String({ maxLength: 150 })),
})

export const StockResultResponse = Type.Object({ ingredients: Type.Array(IngredientResponse) })
