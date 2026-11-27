import { sql } from 'kysely'
import type { Tx } from '../../db/with-tenant.js'
import type { NewMedia } from '../../media/flow.js'
import type { MediaPurpose, MediaRef } from '../../media/variants.js'

export type ProfileRow = {
  is_published: boolean
  published_at: Date | null
  description: string | null
  template: 'foto' | 'papan' | 'hangat'
  accent_color: string
  logo_media_id: string | null
  cover_media_id: string | null
  whatsapp: string | null
  instagram: string | null
  maps_url: string | null
}

export type ProfilePatch = Partial<
  Pick<ProfileRow, 'description' | 'template' | 'accent_color' | 'whatsapp' | 'instagram' | 'maps_url'>
> & {
  is_published?: boolean
  published_at?: Date | null
  logo_media_id?: string | null
  cover_media_id?: string | null
}

const PROFILE_COLUMNS = [
  'is_published',
  'published_at',
  'description',
  'template',
  'accent_color',
  'logo_media_id',
  'cover_media_id',
  'whatsapp',
  'instagram',
  'maps_url',
] as const

export const findProfile = async (trx: Tx, tenantId: string): Promise<ProfileRow | undefined> =>
  (await trx
    .selectFrom('menu_profiles')
    .select(PROFILE_COLUMNS)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst()) as ProfileRow | undefined

// The profile row is created on first use and is the lock for every online-menu
// write and for the recommended/gallery limits (SPEC §12.7): two parallel
// requests queue here, so the second sees what the first committed.
export const lockProfile = async (trx: Tx, tenantId: string): Promise<ProfileRow> => {
  await trx
    .insertInto('menu_profiles')
    .values({ tenant_id: tenantId })
    .onConflict((oc) => oc.column('tenant_id').doNothing())
    .execute()
  return (await trx
    .selectFrom('menu_profiles')
    .select(PROFILE_COLUMNS)
    .where('tenant_id', '=', tenantId)
    .forUpdate()
    .executeTakeFirstOrThrow()) as ProfileRow
}

export const updateProfile = (trx: Tx, tenantId: string, patch: ProfilePatch) =>
  trx.updateTable('menu_profiles').set(patch).where('tenant_id', '=', tenantId).execute()

export const shopBasics = (trx: Tx, tenantId: string) =>
  trx.selectFrom('tenants').select(['name', 'address']).where('id', '=', tenantId).executeTakeFirstOrThrow()

// --- Slugs (D-080)

export const currentSlug = async (trx: Tx, tenantId: string): Promise<string | null> =>
  (
    await trx
      .selectFrom('menu_slugs')
      .select('slug')
      .where('tenant_id', '=', tenantId)
      .where('is_current', '=', true)
      .executeTakeFirst()
  )?.slug ?? null

export const ownSlugExists = async (trx: Tx, tenantId: string, slug: string): Promise<boolean> =>
  (await trx
    .selectFrom('menu_slugs')
    .select('slug')
    .where('tenant_id', '=', tenantId)
    .where('slug', '=', slug)
    .executeTakeFirst()) !== undefined

export const clearCurrentSlug = (trx: Tx, tenantId: string) =>
  trx
    .updateTable('menu_slugs')
    .set({ is_current: false })
    .where('tenant_id', '=', tenantId)
    .where('is_current', '=', true)
    .execute()

export const makeOwnSlugCurrent = (trx: Tx, tenantId: string, slug: string) =>
  trx
    .updateTable('menu_slugs')
    .set({ is_current: true })
    .where('tenant_id', '=', tenantId)
    .where('slug', '=', slug)
    .execute()

// Returns false when the slug belongs to another shop. The primary key is checked
// across all shops (constraints aren't filtered by RLS); ON CONFLICT DO NOTHING
// turns that into "no row" without reading the other shop's row.
export const insertSlug = async (trx: Tx, tenantId: string, slug: string): Promise<boolean> =>
  (
    await trx
      .insertInto('menu_slugs')
      .values({ slug, tenant_id: tenantId, is_current: true })
      .onConflict((oc) => oc.column('slug').doNothing())
      .returning('slug')
      .execute()
  ).length === 1

// --- Hours

export const listHours = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('menu_hours')
    .select(['weekday', 'opens', 'closes'])
    .where('tenant_id', '=', tenantId)
    .orderBy('weekday')
    .execute()

export const replaceHours = async (
  trx: Tx,
  tenantId: string,
  hours: readonly { weekday: number; opens: string; closes: string }[],
) => {
  await trx.deleteFrom('menu_hours').where('tenant_id', '=', tenantId).execute()
  if (hours.length === 0) return
  await trx
    .insertInto('menu_hours')
    .values(hours.map((h) => ({ tenant_id: tenantId, ...h })))
    .execute()
}

// --- Media

const MEDIA_COLUMNS = ['id', 'storage_key', 'purpose', 'width', 'height'] as const
export type MediaRow = MediaRef & { id: string }

export const insertMedia = async (trx: Tx, tenantId: string, media: NewMedia): Promise<MediaRow> =>
  (await trx
    .insertInto('media')
    .values({ tenant_id: tenantId, ...media })
    .returning(MEDIA_COLUMNS)
    .executeTakeFirstOrThrow()) as MediaRow

export const findMedia = async (trx: Tx, tenantId: string, ids: readonly string[]): Promise<MediaRow[]> =>
  ids.length === 0
    ? []
    : ((await trx
        .selectFrom('media')
        .select(MEDIA_COLUMNS)
        .where('tenant_id', '=', tenantId)
        .where('id', 'in', ids)
        .execute()) as MediaRow[])

// Deletes media rows no longer referenced and returns them, so their objects can
// be removed after commit.
export const deleteMedia = async (
  trx: Tx,
  tenantId: string,
  id: string,
): Promise<{ storage_key: string; purpose: MediaPurpose } | undefined> =>
  (await trx
    .deleteFrom('media')
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .returning(['storage_key', 'purpose'])
    .executeTakeFirst()) as { storage_key: string; purpose: MediaPurpose } | undefined

// --- Gallery

export const listGallery = async (trx: Tx, tenantId: string) =>
  (await trx
    .selectFrom('menu_gallery as g')
    .innerJoin('media as m', (j) =>
      j.onRef('m.tenant_id', '=', 'g.tenant_id').onRef('m.id', '=', 'g.media_id'),
    )
    .select(['g.id', 'g.media_id', 'm.storage_key', 'm.purpose', 'm.width', 'm.height'])
    .where('g.tenant_id', '=', tenantId)
    .orderBy('g.created_at')
    .orderBy('g.id')
    .execute()) as (MediaRef & { id: string; media_id: string })[]

export const countGallery = async (trx: Tx, tenantId: string): Promise<number> =>
  Number(
    (
      await trx
        .selectFrom('menu_gallery')
        .select(sql<string>`count(*)`.as('n'))
        .where('tenant_id', '=', tenantId)
        .executeTakeFirstOrThrow()
    ).n,
  )

export const insertGallery = (trx: Tx, tenantId: string, mediaId: string) =>
  trx.insertInto('menu_gallery').values({ tenant_id: tenantId, media_id: mediaId }).execute()

export const deleteGallery = async (trx: Tx, tenantId: string, id: string): Promise<string | undefined> =>
  (
    await trx
      .deleteFrom('menu_gallery')
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returning('media_id')
      .executeTakeFirst()
  )?.media_id

// --- Items

export const countRecommended = async (trx: Tx, tenantId: string, exceptItemId?: string): Promise<number> => {
  let query = trx
    .selectFrom('items')
    .select(sql<string>`count(*)`.as('n'))
    .where('tenant_id', '=', tenantId)
    .where('is_recommended', '=', true)
    .where('archived_at', 'is', null)
  if (exceptItemId !== undefined) query = query.where('id', '<>', exceptItemId)
  return Number((await query.executeTakeFirstOrThrow()).n)
}

export const findItemPhoto = async (trx: Tx, tenantId: string, itemId: string) =>
  trx
    .selectFrom('items')
    .select(['id', 'photo_media_id'])
    .where('tenant_id', '=', tenantId)
    .where('id', '=', itemId)
    .where('archived_at', 'is', null)
    .forUpdate()
    .executeTakeFirst()

export const setItemPhoto = (trx: Tx, tenantId: string, itemId: string, mediaId: string | null) =>
  trx
    .updateTable('items')
    .set({ photo_media_id: mediaId })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', itemId)
    .execute()
