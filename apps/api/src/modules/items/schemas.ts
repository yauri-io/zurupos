import { Type } from 'typebox'
import { Body, Money, Name, Nullable, Sort, Uuid } from '../../http/schemas.js'
import { Img } from '../online-menu/schemas.js'

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

const ItemFields = {
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
}

export const ItemResponse = Type.Object({
  ...ItemFields,
  // Online menu (SPEC §12.7). Dashboard only: bootstrap and the cashier's
  // availability response never carry them (D-079).
  show_online: Type.Boolean(),
  is_recommended: Type.Boolean(),
  photo: Nullable(Img),
})

// PATCH /items/:id/availability is called by the cashier app: no online-menu
// fields, so photos never reach it (D-079).
export const AvailabilityResponse = Type.Object(ItemFields, { additionalProperties: false })

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
  show_online: Type.Optional(Type.Boolean()),
  // At most RECOMMENDED_LIMIT non-archived items per shop (409 recommended_limit).
  is_recommended: Type.Optional(Type.Boolean()),
})

export const AvailabilityBody = Body({ is_available: Type.Boolean() })

export const ItemGroupsBody = Body({
  group_ids: Type.Array(Uuid, { maxItems: 20, uniqueItems: true }),
})
