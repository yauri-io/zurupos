import { Type } from 'typebox'
import { Body, Money, Name, Sort, Uuid } from '../../http/schemas.js'

// Tile colour tokens; the dashboard and the app map them to their palettes.
export const ITEM_COLORS = [
  'neutral',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'teal',
  'sky',
  'blue',
  'indigo',
  'violet',
  'pink',
  'brown',
] as const
const Color = Type.Enum(ITEM_COLORS)

export const ItemResponse = Type.Object({
  id: Uuid,
  category_id: Uuid,
  name: Type.String(),
  price: Type.Integer(),
  color: Type.String(),
  sort: Type.Integer(),
  is_active: Type.Boolean(),
  is_available: Type.Boolean(),
  // Attached modifier groups, in the order the modifier sheet shows them.
  modifier_group_ids: Type.Array(Uuid),
})

export const ItemListResponse = Type.Object({ items: Type.Array(ItemResponse) })

export const ItemListQuery = Type.Object(
  { category_id: Type.Optional(Uuid) },
  { additionalProperties: false },
)

export const CreateItemBody = Body({
  category_id: Uuid,
  name: Name(80),
  price: Money,
  color: Type.Optional(Color),
  sort: Type.Optional(Sort),
  is_active: Type.Optional(Type.Boolean()),
  is_available: Type.Optional(Type.Boolean()),
})

export const UpdateItemBody = Body({
  category_id: Type.Optional(Uuid),
  name: Type.Optional(Name(80)),
  price: Type.Optional(Money),
  color: Type.Optional(Color),
  sort: Type.Optional(Sort),
  is_active: Type.Optional(Type.Boolean()),
  is_available: Type.Optional(Type.Boolean()),
})

export const AvailabilityBody = Body({ is_available: Type.Boolean() })

export const ItemGroupsBody = Body({
  group_ids: Type.Array(Uuid, { maxItems: 20, uniqueItems: true }),
})
