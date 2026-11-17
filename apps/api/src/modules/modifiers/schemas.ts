import { Type } from 'typebox'
import { Body, Money, Name, Sort, Uuid } from '../../http/schemas.js'

const Selection = Type.Enum(['single', 'multiple'])
const SelectCount = Type.Integer({ minimum: 0, maximum: 50 })

export const OptionResponse = Type.Object({
  id: Uuid,
  group_id: Uuid,
  name: Type.String(),
  price_delta: Type.Integer(),
  is_default: Type.Boolean(),
  sort: Type.Integer(),
  is_active: Type.Boolean(),
})

export const GroupResponse = Type.Object({
  id: Uuid,
  name: Type.String(),
  selection: Selection,
  min_select: Type.Integer(),
  max_select: Type.Integer(),
  // Required ⇔ min_select ≥ 1 (SPEC §4.1).
  required: Type.Boolean(),
  sort: Type.Integer(),
  options: Type.Array(OptionResponse),
})

export const GroupListResponse = Type.Object({ groups: Type.Array(GroupResponse) })

export const CreateGroupBody = Body({
  name: Name(60),
  selection: Selection,
  min_select: Type.Optional(SelectCount),
  max_select: Type.Optional(SelectCount),
  sort: Type.Optional(Sort),
})

export const UpdateGroupBody = Body({
  name: Type.Optional(Name(60)),
  selection: Type.Optional(Selection),
  min_select: Type.Optional(SelectCount),
  max_select: Type.Optional(SelectCount),
  sort: Type.Optional(Sort),
})

export const CreateOptionBody = Body({
  group_id: Uuid,
  name: Name(60),
  price_delta: Type.Optional(Money),
  is_default: Type.Optional(Type.Boolean()),
  sort: Type.Optional(Sort),
  is_active: Type.Optional(Type.Boolean()),
})

export const UpdateOptionBody = Body({
  name: Type.Optional(Name(60)),
  price_delta: Type.Optional(Money),
  is_default: Type.Optional(Type.Boolean()),
  sort: Type.Optional(Sort),
  is_active: Type.Optional(Type.Boolean()),
})
