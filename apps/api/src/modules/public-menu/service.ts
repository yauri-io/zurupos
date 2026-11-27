// The public online menu (SPEC §12.7, D-081) and the owner's preview of it.
import { createHash } from 'node:crypto'
import { findPublicMenu } from '../../auth/lookups.js'
import type { Database } from '../../db/kysely.js'
import { withTenant, withTenantReadOnly, type Tx } from '../../db/with-tenant.js'
import { apiError } from '../../http/errors.js'
import { money } from '../../http/serialize.js'
import type { MediaStore } from '../../media/store.js'
import { presentImg } from '../../media/variants.js'
import { DEFAULT_ACCENT, DEFAULT_TEMPLATE, type Template } from '../online-menu/schemas.js'
import { toHhMm } from '../online-menu/validate.js'
import { SLUG_PATTERN } from '../online-menu/reserved-slugs.js'
import { isBot } from './bots.js'
import * as q from './queries.js'
import type { ViewWindow } from './view-window.js'

const SLUG_RE = new RegExp(SLUG_PATTERN)

// The preview may show unsaved look choices (§12.7).
export type LookOverrides = { template?: Template | undefined; accent_color?: string | undefined }

export const buildMenu = async (
  trx: Tx,
  tenantId: string,
  store: MediaStore,
  overrides: LookOverrides = {},
) => {
  const [shop, hours, categories, items, gallery] = await Promise.all([
    q.shop(trx, tenantId),
    q.hours(trx, tenantId),
    q.categories(trx, tenantId),
    q.items(trx, tenantId),
    q.gallery(trx, tenantId),
  ])
  const mediaIds = [shop.logo_media_id, shop.cover_media_id, ...items.map((i) => i.photo_media_id)].filter(
    (id): id is string => id !== null,
  )
  const media = new Map((await q.media(trx, tenantId, mediaIds)).map((m) => [m.id, m]))
  const img = (id: string | null) => presentImg(store, id === null ? null : (media.get(id) ?? null))

  const listed = categories
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: items
        .filter((i) => i.category_id === c.id)
        .map((i) => ({
          id: i.id,
          name: i.name,
          price: money(i.price),
          sold_out: !i.is_available,
          recommended: i.is_recommended,
          photo: img(i.photo_media_id),
        })),
    }))
    .filter((c) => c.items.length > 0)

  const payload = {
    kind: 'menu' as const,
    shop: {
      name: shop.name,
      description: shop.description,
      address: shop.address,
      timezone: shop.timezone,
      template: overrides.template ?? (shop.template as Template | null) ?? DEFAULT_TEMPLATE,
      accent_color: overrides.accent_color?.toLowerCase() ?? shop.accent_color ?? DEFAULT_ACCENT,
      logo: img(shop.logo_media_id),
      cover: img(shop.cover_media_id),
      whatsapp: shop.whatsapp,
      instagram: shop.instagram,
      maps_url: shop.maps_url,
      hours: hours.map((h) => ({ weekday: h.weekday, opens: toHhMm(h.opens), closes: toHhMm(h.closes) })),
      price_note:
        shop.tax_enabled || shop.service_charge_enabled
          ? { tax_name: shop.tax_enabled ? shop.tax_name : null, service_charge: shop.service_charge_enabled }
          : null,
    },
    recommended: listed.flatMap((c) => c.items.filter((i) => i.recommended).map((i) => i.id)),
    categories: listed,
    gallery: gallery.map((g) => presentImg(store, g)).filter((g) => g !== null),
  }
  // Like bootstrap (D-040): a hash of what the page shows.
  const menu_version = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32)
  return { ...payload, menu_version }
}

export type PublicMenu = Awaited<ReturnType<typeof buildMenu>>

// GET /v1/public/menus/:slug. The tenant id comes from auth.find_public_menu
// (D-081), never from the request; the page is read in a read-only transaction.
export const readPublicMenu = async (
  db: Database,
  store: MediaStore,
  slug: string,
): Promise<PublicMenu | { kind: 'moved'; slug: string }> => {
  if (!SLUG_RE.test(slug.toLowerCase())) throw apiError('NOT_FOUND')
  const found = await findPublicMenu(db, slug)
  if (!found) throw apiError('NOT_FOUND')
  // An old slug, or the right one in other letter case: send people to the current one.
  if (found.current_slug !== slug) return { kind: 'moved', slug: found.current_slug }
  return withTenantReadOnly(db, found.tenant_id, async (trx) => {
    await q.assertReadOnly(trx)
    return buildMenu(trx, found.tenant_id, store)
  })
}

// POST /v1/public/menus/:slug/views (O3, D-083): counts at most once per IP +
// user agent + slug per 30 minutes, never for bots, unpublished menus or
// unknown slugs. Returns whether it counted (the route always answers 204).
export type ViewInput = { slug: string; source: unknown; ip: string; userAgent: string | undefined }

export const recordView = async (
  db: Database,
  window: ViewWindow,
  input: ViewInput,
  now: Date = new Date(),
): Promise<boolean> => {
  if (isBot(input.userAgent)) return false
  if (!SLUG_RE.test(input.slug.toLowerCase())) return false
  const found = await findPublicMenu(db, input.slug)
  if (!found) return false
  const source = input.source === 'qr' ? 'qr' : 'link'
  if (!window.firstIn([input.ip, input.userAgent ?? '', found.current_slug], now.getTime())) return false
  await withTenant(db, found.tenant_id, (trx) => q.recordView(trx, found.tenant_id, source, now))
  return true
}

// The beacon sends text/plain JSON ({"source":"qr"}); anything unreadable is a link view.
export const sourceOf = (body: unknown): unknown => {
  if (typeof body === 'string') {
    try {
      return (JSON.parse(body) as { source?: unknown } | null)?.source
    } catch {
      return undefined
    }
  }
  return typeof body === 'object' && body !== null ? (body as { source?: unknown }).source : undefined
}
