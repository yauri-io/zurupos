// The public online menu payload (SPEC §12.7). Every object lists every field
// and allows nothing else (D-081): a cost, stock or staff field can't leak in
// through a shared query later, because it isn't in the contract.
import { Type, type TProperties } from 'typebox'
import { Nullable, Uuid } from '../../http/schemas.js'

const Closed = <T extends TProperties>(properties: T) =>
  Type.Object(properties, { additionalProperties: false })

export const PublicImg = Closed({
  url_small: Type.String(),
  url_large: Type.String(),
  width: Type.Integer(),
  height: Type.Integer(),
})

export const PublicHours = Closed({ weekday: Type.Integer(), opens: Type.String(), closes: Type.String() })

export const PublicShop = Closed({
  name: Type.String(),
  description: Nullable(Type.String()),
  address: Nullable(Type.String()),
  timezone: Type.String(),
  template: Type.Enum(['foto', 'papan', 'hangat']),
  accent_color: Type.String(),
  logo: Nullable(PublicImg),
  cover: Nullable(PublicImg),
  whatsapp: Nullable(Type.String()),
  instagram: Nullable(Type.String()),
  maps_url: Nullable(Type.String()),
  hours: Type.Array(PublicHours),
  // Set when the shop adds tax or a service charge to the base prices shown.
  price_note: Nullable(Closed({ tax_name: Nullable(Type.String()), service_charge: Type.Boolean() })),
})

export const PublicItem = Closed({
  id: Uuid,
  name: Type.String(),
  // Base price in whole rupiah, without tax or service charge.
  price: Type.Integer(),
  sold_out: Type.Boolean(),
  recommended: Type.Boolean(),
  photo: Nullable(PublicImg),
})

export const PublicMenu = Closed({
  kind: Type.Literal('menu'),
  shop: PublicShop,
  // Recommended item ids in category, then item order.
  recommended: Type.Array(Uuid),
  categories: Type.Array(Closed({ id: Uuid, name: Type.String(), items: Type.Array(PublicItem) })),
  gallery: Type.Array(PublicImg),
  menu_version: Type.String(),
})

// An old slug of a published shop: the menu app answers 308 to the current one.
export const PublicMoved = Closed({ kind: Type.Literal('moved'), slug: Type.String() })

export const PublicMenuResponse = Type.Union([PublicMenu, PublicMoved])

export const SlugParams = Closed({ slug: Type.String({ minLength: 1, maxLength: 64 }) })
