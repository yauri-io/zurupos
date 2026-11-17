import { Type } from 'typebox'
import { Body, MAX_MONEY, Name, Uuid } from '../../http/schemas.js'

const Kind = Type.Enum(['percent', 'fixed'])
const Scope = Type.Enum(['item', 'order'])
// percent: basis points 1..10000; fixed: whole rupiah > 0 (checked against kind in the service).
const Value = Type.Integer({ minimum: 1, maximum: MAX_MONEY })

export const DiscountResponse = Type.Object({
  id: Uuid,
  name: Type.String(),
  kind: Kind,
  value: Type.Integer(),
  scope: Scope,
  is_active: Type.Boolean(),
})

export const DiscountListResponse = Type.Object({ discounts: Type.Array(DiscountResponse) })

export const CreateDiscountBody = Body({
  name: Name(60),
  kind: Kind,
  value: Value,
  scope: Scope,
  is_active: Type.Optional(Type.Boolean()),
})

export const UpdateDiscountBody = Body({
  name: Type.Optional(Name(60)),
  kind: Type.Optional(Kind),
  value: Type.Optional(Value),
  scope: Type.Optional(Scope),
  is_active: Type.Optional(Type.Boolean()),
})
