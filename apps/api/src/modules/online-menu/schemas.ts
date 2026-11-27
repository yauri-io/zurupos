import { Type } from 'typebox'
import { Body, DateTime, Nullable, Uuid } from '../../http/schemas.js'
import { SLUG_PATTERN } from './reserved-slugs.js'

export const TEMPLATES = ['foto', 'papan', 'hangat'] as const
export type Template = (typeof TEMPLATES)[number]
// Column defaults in the migration (SPEC §4.1).
export const DEFAULT_TEMPLATE: Template = 'papan'
export const DEFAULT_ACCENT = '#6b4f3a'
export const RECOMMENDED_LIMIT = 5
export const GALLERY_LIMIT = 6
export const DESCRIPTION_MAX = 160

export const Img = Type.Object({
  url_small: Type.String(),
  url_large: Type.String(),
  width: Type.Integer(),
  height: Type.Integer(),
})

const Time = Type.String({ pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' })
const Weekday = Type.Integer({ minimum: 1, maximum: 7 })
export const Slug = Type.String({ pattern: SLUG_PATTERN })
const AccentColor = Type.String({ pattern: '^#[0-9a-fA-F]{6}$' })
const Whatsapp = Type.String({ pattern: '^62[0-9]{8,13}$' })
const Instagram = Type.String({ pattern: '^[a-z0-9._]{1,30}$' })

export const Hours = Type.Object({ weekday: Weekday, opens: Time, closes: Time })

export const OnlineMenuResponse = Type.Object({
  // From the shop settings (receipt name and address); read-only here.
  name: Type.String(),
  address: Nullable(Type.String()),
  is_published: Type.Boolean(),
  published_at: Nullable(DateTime),
  slug: Nullable(Type.String()),
  // <MENU_PUBLIC_BASE_URL>/<slug>, and the same with ?s=qr for the QR code.
  public_url: Nullable(Type.String()),
  qr_url: Nullable(Type.String()),
  description: Nullable(Type.String()),
  template: Type.Enum(TEMPLATES),
  accent_color: Type.String(),
  whatsapp: Nullable(Type.String()),
  instagram: Nullable(Type.String()),
  maps_url: Nullable(Type.String()),
  logo: Nullable(Img),
  cover: Nullable(Img),
  hours: Type.Array(Hours),
  gallery: Type.Array(Type.Object({ id: Uuid, image: Img })),
  recommended_count: Type.Integer(),
  limits: Type.Object({ recommended: Type.Integer(), gallery: Type.Integer(), description: Type.Integer() }),
})

// Any subset; null clears a field. The slug can be changed but never cleared:
// once a shop has one, its links and printed QR codes must keep working (D-080).
export const UpdateOnlineMenuBody = Body({
  slug: Type.Optional(Slug),
  description: Type.Optional(Nullable(Type.String({ maxLength: DESCRIPTION_MAX }))),
  template: Type.Optional(Type.Enum(TEMPLATES)),
  accent_color: Type.Optional(AccentColor),
  whatsapp: Type.Optional(Nullable(Whatsapp)),
  instagram: Type.Optional(Nullable(Instagram)),
  maps_url: Type.Optional(Nullable(Type.String({ maxLength: 500 }))),
})

// Replaces the week; a weekday left out is closed.
export const HoursBody = Body({ hours: Type.Array(Hours, { maxItems: 7 }) })

// Unsaved look choices for the preview, so it follows the form (SPEC §12.7).
export const PreviewQuery = Type.Object(
  { template: Type.Optional(Type.Enum(TEMPLATES)), accent_color: Type.Optional(AccentColor) },
  { additionalProperties: false },
)

export const ViewsQuery = Type.Object(
  { days: Type.Optional(Type.Union([Type.Literal('7'), Type.Literal('30'), Type.Literal('90')])) },
  { additionalProperties: false },
)

export const ViewsResponse = Type.Object({
  today: Type.Integer(),
  last_7: Type.Integer(),
  previous_7: Type.Integer(),
  days: Type.Array(Type.Object({ business_date: Type.String(), qr: Type.Integer(), link: Type.Integer() })),
})

// Multipart uploads (one `file` part) are read in the handler, not by a schema.
export const UPLOAD_CONSUMES = ['multipart/form-data']
