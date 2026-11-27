// Owner endpoints for the online menu (SPEC §12.7, PRD F18). Every write takes
// the shop's menu_profiles row lock first (queries.lockProfile).
import { writeAudit } from '../../audit/audit.js'
import type { AuthContext } from '../../auth/context.js'
import type { Tx } from '../../db/with-tenant.js'
import { apiError } from '../../http/errors.js'
import { isoOrNull } from '../../http/serialize.js'
import type { NewMedia, ReplacedMedia } from '../../media/flow.js'
import type { MediaStore } from '../../media/store.js'
import { presentImg } from '../../media/variants.js'
import { getItem } from '../items/service.js'
import * as q from './queries.js'
import { isReservedSlug } from './reserved-slugs.js'
import { DESCRIPTION_MAX, GALLERY_LIMIT, RECOMMENDED_LIMIT } from './schemas.js'
import { isAllowedMapsUrl, toHhMm } from './validate.js'

export type OnlineMenuDeps = { store: MediaStore; menuBaseUrl: string }

// What a shop has before it ever saves anything (column defaults in the migration).
const DEFAULT_PROFILE: q.ProfileRow = {
  is_published: false,
  published_at: null,
  description: null,
  template: 'papan',
  accent_color: '#6b4f3a',
  logo_media_id: null,
  cover_media_id: null,
  whatsapp: null,
  instagram: null,
  maps_url: null,
}

export const present = async (trx: Tx, auth: AuthContext, deps: OnlineMenuDeps) => {
  const tenantId = auth.tenantId
  const profile = (await q.findProfile(trx, tenantId)) ?? DEFAULT_PROFILE
  const [shop, slug, hours, gallery, recommended] = await Promise.all([
    q.shopBasics(trx, tenantId),
    q.currentSlug(trx, tenantId),
    q.listHours(trx, tenantId),
    q.listGallery(trx, tenantId),
    q.countRecommended(trx, tenantId),
  ])
  const ids = [profile.logo_media_id, profile.cover_media_id].filter((id): id is string => id !== null)
  const media = new Map((await q.findMedia(trx, tenantId, ids)).map((m) => [m.id, m]))
  const img = (id: string | null) => presentImg(deps.store, id ? (media.get(id) ?? null) : null)
  const publicUrl = slug ? `${deps.menuBaseUrl}/${slug}` : null
  return {
    name: shop.name,
    address: shop.address,
    is_published: profile.is_published,
    published_at: isoOrNull(profile.published_at),
    slug,
    public_url: publicUrl,
    qr_url: publicUrl ? `${publicUrl}?s=qr` : null,
    description: profile.description,
    template: profile.template,
    accent_color: profile.accent_color,
    whatsapp: profile.whatsapp,
    instagram: profile.instagram,
    maps_url: profile.maps_url,
    logo: img(profile.logo_media_id),
    cover: img(profile.cover_media_id),
    hours: hours.map((h) => ({ weekday: h.weekday, opens: toHhMm(h.opens), closes: toHhMm(h.closes) })),
    gallery: gallery.map((g) => ({ id: g.id, image: presentImg(deps.store, g) ?? unreachable() })),
    recommended_count: recommended,
    limits: { recommended: RECOMMENDED_LIMIT, gallery: GALLERY_LIMIT, description: DESCRIPTION_MAX },
  }
}

const unreachable = (): never => {
  throw new Error('gallery row without media')
}

export type OnlineMenu = Awaited<ReturnType<typeof present>>

const audit = (
  trx: Tx,
  auth: AuthContext,
  action: 'settings.change' | 'online_menu.publish' | 'online_menu.unpublish' | 'online_menu.slug',
  data: Record<string, unknown>,
) =>
  writeAudit(trx, {
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action,
    entityType: 'menu_profile',
    entityId: auth.tenantId,
    data,
  })

// --- Profile and slug

export type ProfileInput = {
  slug?: string
  description?: string | null
  template?: 'foto' | 'papan' | 'hangat'
  accent_color?: string
  whatsapp?: string | null
  instagram?: string | null
  maps_url?: string | null
}

// D-080: a new slug becomes current; one this shop used before is made current
// again; one of another shop is a conflict. Old slugs stay reserved for the shop.
const changeSlug = async (trx: Tx, auth: AuthContext, slug: string) => {
  const from = await q.currentSlug(trx, auth.tenantId)
  if (from === slug) return
  if (isReservedSlug(slug)) throw apiError('VALIDATION', { field: 'slug', reason: 'slug_reserved' })
  await q.clearCurrentSlug(trx, auth.tenantId)
  if (await q.ownSlugExists(trx, auth.tenantId, slug)) {
    await q.makeOwnSlugCurrent(trx, auth.tenantId, slug)
  } else if (!(await q.insertSlug(trx, auth.tenantId, slug))) {
    // Throwing rolls the transaction back, so the previous slug stays current.
    throw apiError('CONFLICT', { field: 'slug', reason: 'slug_taken' })
  }
  await audit(trx, auth, 'online_menu.slug', { from, to: slug })
}

const profilePatch = (input: ProfileInput): q.ProfilePatch => {
  const patch: q.ProfilePatch = {}
  if (input.description !== undefined) {
    const text = input.description?.trim() ?? ''
    patch.description = text === '' ? null : text
  }
  if (input.template !== undefined) patch.template = input.template
  if (input.accent_color !== undefined) patch.accent_color = input.accent_color.toLowerCase()
  if (input.whatsapp !== undefined) patch.whatsapp = input.whatsapp
  if (input.instagram !== undefined) patch.instagram = input.instagram
  if (input.maps_url !== undefined) {
    const url = input.maps_url?.trim() ?? ''
    if (url !== '' && !isAllowedMapsUrl(url)) {
      throw apiError('VALIDATION', { field: 'maps_url', reason: 'maps_url_not_allowed' })
    }
    patch.maps_url = url === '' ? null : url
  }
  return patch
}

export const updateProfile = async (
  trx: Tx,
  auth: AuthContext,
  deps: OnlineMenuDeps,
  input: ProfileInput,
) => {
  await q.lockProfile(trx, auth.tenantId)
  if (input.slug !== undefined) await changeSlug(trx, auth, input.slug)
  const patch = profilePatch(input)
  if (Object.keys(patch).length > 0) {
    await q.updateProfile(trx, auth.tenantId, patch)
    await audit(trx, auth, 'settings.change', { online_menu: patch })
  }
  return present(trx, auth, deps)
}

// --- Hours

export type HoursInput = { weekday: number; opens: string; closes: string }[]

export const setHours = async (trx: Tx, auth: AuthContext, deps: OnlineMenuDeps, hours: HoursInput) => {
  if (new Set(hours.map((h) => h.weekday)).size !== hours.length) {
    throw apiError('VALIDATION', { field: 'hours', reason: 'duplicate_weekday' })
  }
  if (hours.some((h) => h.opens === h.closes)) {
    throw apiError('VALIDATION', { field: 'hours', reason: 'opens_equals_closes' })
  }
  await q.lockProfile(trx, auth.tenantId)
  const sorted = [...hours].sort((a, b) => a.weekday - b.weekday)
  await q.replaceHours(trx, auth.tenantId, sorted)
  await audit(trx, auth, 'settings.change', { online_menu: { hours: sorted } })
  return present(trx, auth, deps)
}

// --- Publish

export const publish = async (trx: Tx, auth: AuthContext, deps: OnlineMenuDeps) => {
  const profile = await q.lockProfile(trx, auth.tenantId)
  const slug = await q.currentSlug(trx, auth.tenantId)
  if (!slug) throw apiError('CONFLICT', { reason: 'slug_required' })
  if (!profile.is_published) {
    await q.updateProfile(trx, auth.tenantId, { is_published: true, published_at: new Date() })
    await audit(trx, auth, 'online_menu.publish', { slug })
  }
  return present(trx, auth, deps)
}

export const unpublish = async (trx: Tx, auth: AuthContext, deps: OnlineMenuDeps) => {
  const profile = await q.lockProfile(trx, auth.tenantId)
  if (profile.is_published) {
    await q.updateProfile(trx, auth.tenantId, { is_published: false, published_at: null })
    await audit(trx, auth, 'online_menu.unpublish', {})
  }
  return present(trx, auth, deps)
}

// --- Logo, cover and gallery. Each runs after the new objects exist and returns
// the media rows it replaced, so their objects are deleted after commit (§12.7).

type MediaChange = { result: OnlineMenu; replaced: ReplacedMedia[] }

const dropMedia = async (trx: Tx, tenantId: string, id: string | null): Promise<ReplacedMedia[]> => {
  if (id === null) return []
  const removed = await q.deleteMedia(trx, tenantId, id)
  return removed ? [removed] : []
}

export type ProfileImageSlot = 'logo' | 'cover'
const slotColumn = { logo: 'logo_media_id', cover: 'cover_media_id' } as const

export const setProfileImage = async (
  trx: Tx,
  auth: AuthContext,
  deps: OnlineMenuDeps,
  slot: ProfileImageSlot,
  created: NewMedia,
): Promise<MediaChange> => {
  const profile = await q.lockProfile(trx, auth.tenantId)
  const media = await q.insertMedia(trx, auth.tenantId, created)
  await q.updateProfile(trx, auth.tenantId, { [slotColumn[slot]]: media.id })
  const replaced = await dropMedia(trx, auth.tenantId, profile[slotColumn[slot]])
  await audit(trx, auth, 'settings.change', { online_menu: { [slot]: 'uploaded' } })
  return { result: await present(trx, auth, deps), replaced }
}

export const removeProfileImage = async (
  trx: Tx,
  auth: AuthContext,
  deps: OnlineMenuDeps,
  slot: ProfileImageSlot,
): Promise<MediaChange> => {
  const profile = await q.lockProfile(trx, auth.tenantId)
  const current = profile[slotColumn[slot]]
  if (current === null) return { result: await present(trx, auth, deps), replaced: [] }
  await q.updateProfile(trx, auth.tenantId, { [slotColumn[slot]]: null })
  const replaced = await dropMedia(trx, auth.tenantId, current)
  await audit(trx, auth, 'settings.change', { online_menu: { [slot]: 'removed' } })
  return { result: await present(trx, auth, deps), replaced }
}

export const addGalleryPhoto = async (
  trx: Tx,
  auth: AuthContext,
  deps: OnlineMenuDeps,
  created: NewMedia,
): Promise<MediaChange> => {
  await q.lockProfile(trx, auth.tenantId)
  if ((await q.countGallery(trx, auth.tenantId)) >= GALLERY_LIMIT) {
    throw apiError('CONFLICT', { reason: 'gallery_limit', limit: GALLERY_LIMIT })
  }
  const media = await q.insertMedia(trx, auth.tenantId, created)
  await q.insertGallery(trx, auth.tenantId, media.id)
  await audit(trx, auth, 'settings.change', { online_menu: { gallery: 'added' } })
  return { result: await present(trx, auth, deps), replaced: [] }
}

export const removeGalleryPhoto = async (
  trx: Tx,
  auth: AuthContext,
  deps: OnlineMenuDeps,
  id: string,
): Promise<MediaChange> => {
  await q.lockProfile(trx, auth.tenantId)
  const mediaId = await q.deleteGallery(trx, auth.tenantId, id)
  if (mediaId === undefined) throw apiError('NOT_FOUND')
  const replaced = await dropMedia(trx, auth.tenantId, mediaId)
  await audit(trx, auth, 'settings.change', { online_menu: { gallery: 'removed' } })
  return { result: await present(trx, auth, deps), replaced }
}

// --- Item photo (owner and manager, PRD §6). The item row lock serialises two
// uploads for the same item; the response is the item as GET /items/:id shows it.

export const setItemPhoto = async (
  trx: Tx,
  auth: AuthContext,
  deps: OnlineMenuDeps,
  itemId: string,
  created: NewMedia,
) => {
  const item = await q.findItemPhoto(trx, auth.tenantId, itemId)
  if (!item) throw apiError('NOT_FOUND')
  const media = await q.insertMedia(trx, auth.tenantId, created)
  await q.setItemPhoto(trx, auth.tenantId, itemId, media.id)
  const replaced = await dropMedia(trx, auth.tenantId, item.photo_media_id)
  return { result: await getItem(trx, auth, deps, itemId), replaced }
}

export const removeItemPhoto = async (trx: Tx, auth: AuthContext, deps: OnlineMenuDeps, itemId: string) => {
  const item = await q.findItemPhoto(trx, auth.tenantId, itemId)
  if (!item) throw apiError('NOT_FOUND')
  if (item.photo_media_id === null) return { result: await getItem(trx, auth, deps, itemId), replaced: [] }
  await q.setItemPhoto(trx, auth.tenantId, itemId, null)
  const replaced = await dropMedia(trx, auth.tenantId, item.photo_media_id)
  return { result: await getItem(trx, auth, deps, itemId), replaced }
}
