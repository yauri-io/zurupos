// The only queries behind the public online menu (D-081). Each selects public
// columns by name: no costs, recipes, stock, modifiers, staff or settings beyond
// what the page shows. Always run inside a tenant context; the public route runs
// them in a read-only transaction.
import { sql } from 'kysely'
import type { Tx } from '../../db/with-tenant.js'
import type { MediaPurpose } from '../../media/variants.js'

// Defence in depth for the public route: refuse to read unless the transaction
// is read only (withTenantReadOnly).
export const assertReadOnly = async (trx: Tx): Promise<void> => {
  const { rows } = await sql<{ ro: string }>`select current_setting('transaction_read_only') as ro`.execute(
    trx,
  )
  if (rows[0]?.ro !== 'on') throw new Error('public menu: transaction is not read only')
}

export const shop = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('tenants as t')
    .leftJoin('menu_profiles as p', 'p.tenant_id', 't.id')
    .select([
      't.name',
      't.address',
      't.timezone',
      't.tax_enabled',
      't.tax_name',
      't.service_charge_enabled',
      'p.description',
      'p.template',
      'p.accent_color',
      'p.logo_media_id',
      'p.cover_media_id',
      'p.whatsapp',
      'p.instagram',
      'p.maps_url',
    ])
    .where('t.id', '=', tenantId)
    .executeTakeFirstOrThrow()

export const hours = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('menu_hours')
    .select(['weekday', 'opens', 'closes'])
    .where('tenant_id', '=', tenantId)
    .orderBy('weekday')
    .execute()

// Active, non-archived categories, in POS order.
export const categories = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('categories')
    .select(['id', 'name'])
    .where('tenant_id', '=', tenantId)
    .where('is_active', '=', true)
    .where('archived_at', 'is', null)
    .orderBy('sort')
    .orderBy('name')
    .orderBy('id')
    .execute()

// Items listed online: active, not archived, show_online; in POS order.
export const items = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('items')
    .select(['id', 'category_id', 'name', 'price', 'is_available', 'is_recommended', 'photo_media_id'])
    .where('tenant_id', '=', tenantId)
    .where('is_active', '=', true)
    .where('archived_at', 'is', null)
    .where('show_online', '=', true)
    .orderBy('sort')
    .orderBy('name')
    .orderBy('id')
    .execute()

export type PublicMediaRow = {
  id: string
  storage_key: string
  purpose: MediaPurpose
  width: number
  height: number
}

export const media = async (trx: Tx, tenantId: string, ids: readonly string[]): Promise<PublicMediaRow[]> =>
  ids.length === 0
    ? []
    : ((await trx
        .selectFrom('media')
        .select(['id', 'storage_key', 'purpose', 'width', 'height'])
        .where('tenant_id', '=', tenantId)
        .where('id', 'in', ids)
        .execute()) as PublicMediaRow[])

export const gallery = async (trx: Tx, tenantId: string) =>
  (await trx
    .selectFrom('menu_gallery as g')
    .innerJoin('media as m', (j) =>
      j.onRef('m.tenant_id', '=', 'g.tenant_id').onRef('m.id', '=', 'g.media_id'),
    )
    .select(['m.id', 'm.storage_key', 'm.purpose', 'm.width', 'm.height'])
    .where('g.tenant_id', '=', tenantId)
    .orderBy('g.created_at')
    .orderBy('g.id')
    .execute()) as PublicMediaRow[]

// One view on the shop's business date (SPEC §12.1: local time minus the cutoff
// hours), per source. Runs in its own short tenant transaction (D-081).
export const recordView = (trx: Tx, tenantId: string, source: 'qr' | 'link', now: Date) =>
  sql`
    insert into menu_views_daily (tenant_id, business_date, source, views)
    select t.id,
           ((${now.toISOString()}::timestamptz at time zone t.timezone)
             - make_interval(hours => t.business_day_cutoff_hour))::date,
           ${source}, 1
    from tenants t
    where t.id = ${tenantId}
    on conflict (tenant_id, business_date, source)
      do update set views = menu_views_daily.views + 1
  `.execute(trx)
