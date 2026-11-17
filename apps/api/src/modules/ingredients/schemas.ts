import { Type } from 'typebox'
import { Body, Cost, PageQuery, DateTime, Money, Name, Nullable, Qty, SignedQty, Uuid } from '../../http/schemas.js'

export const BaseUnit = Type.Enum(['g', 'ml', 'pcs'])

export const IngredientResponse = Type.Object({
  id: Uuid,
  name: Type.String(),
  base_unit: BaseUnit,
  stock_qty: SignedQty,
  low_stock_threshold: Qty,
  purchase_unit_name: Nullable(Type.String()),
  purchase_unit_size: Nullable(Qty),
  // threshold > 0 and stock at or below it.
  is_low: Type.Boolean(),
  archived: Type.Boolean(),
  // Owner only (costs.view); absent for every other role (SPEC §5.5).
  avg_cost: Type.Optional(Cost),
})

export const IngredientListResponse = Type.Object({ ingredients: Type.Array(IngredientResponse) })

const PurchaseUnitName = Nullable(Name(40))

export const CreateIngredientBody = Body({
  name: Name(80),
  base_unit: BaseUnit,
  low_stock_threshold: Type.Optional(Qty),
  purchase_unit_name: Type.Optional(PurchaseUnitName),
  purchase_unit_size: Type.Optional(Nullable(Qty)),
})

// base_unit is fixed after creation: recipes and stock are expressed in it (D-032).
export const UpdateIngredientBody = Body({
  name: Type.Optional(Name(80)),
  low_stock_threshold: Type.Optional(Qty),
  purchase_unit_name: Type.Optional(PurchaseUnitName),
  purchase_unit_size: Type.Optional(Nullable(Qty)),
})

export const MovementType = Type.Enum(['sale', 'void_return', 'stock_in', 'waste', 'count_adjust'])

export const MovementResponse = Type.Object({
  id: Uuid,
  type: MovementType,
  qty_delta: SignedQty,
  balance_after: SignedQty,
  order_id: Nullable(Uuid),
  reason: Nullable(Type.String()),
  counted_qty: Nullable(Qty),
  created_by: Type.Object({ id: Uuid, name: Type.String() }),
  created_at: DateTime,
  // Owner only.
  unit_cost: Type.Optional(Cost),
  total_cost: Type.Optional(Nullable(Money)),
})

export const MovementListQuery = PageQuery

export const MovementListResponse = Type.Object({
  movements: Type.Array(MovementResponse),
  next_cursor: Nullable(Type.String()),
})
