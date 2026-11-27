// Scheduler queries (SPEC §12.6). auth.report_schedule() is the only one that
// runs without a tenant context (D-075); everything else runs inside withTenant.
import { sql, type Kysely } from 'kysely'
import type { DB } from '../db/types.js'
import type { Tx } from '../db/with-tenant.js'
import type { ReportKind } from '../domain/report-schedule.js'

export type ScheduleRow = {
  tenant_id: string
  timezone: string
  business_day_cutoff_hour: number
  daily_summary_enabled: boolean
  weekly_summary_enabled: boolean
}

export const reportSchedule = async (db: Kysely<DB>) =>
  (await sql<ScheduleRow>`select * from auth.report_schedule()`.execute(db)).rows

// Claims the period: true if this pass inserted the run row, false if another
// pass already did. Inserted first, so a parallel pass blocks on the key and then
// finds it taken.
export const claimRun = async (trx: Tx, tenantId: string, kind: ReportKind, periodStart: string) =>
  (await trx
    .insertInto('report_email_runs')
    .values({ tenant_id: tenantId, kind, period_start: periodStart })
    .onConflict((oc) => oc.columns(['tenant_id', 'kind', 'period_start']).doNothing())
    .returning('id')
    .executeTakeFirst()) !== undefined

export const shopAndOwner = async (trx: Tx, tenantId: string) => {
  const shop = await trx
    .selectFrom('tenants')
    .select('name')
    .where('id', '=', tenantId)
    .executeTakeFirstOrThrow()
  const owner = await trx
    .selectFrom('users')
    .select(['email', 'locale'])
    .where('tenant_id', '=', tenantId)
    .where('role', '=', 'owner')
    .where('is_active', '=', true)
    .executeTakeFirst()
  return {
    name: shop.name,
    ownerEmail: owner?.email ?? null,
    locale: owner?.locale === 'en' ? 'en' : 'id',
  } as const
}

export const lowStockCount = async (trx: Tx, tenantId: string) =>
  Number(
    (
      await trx
        .selectFrom('ingredients')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('tenant_id', '=', tenantId)
        .where('archived_at', 'is', null)
        .where('low_stock_threshold', '>', '0')
        .whereRef('stock_qty', '<=', 'low_stock_threshold')
        .executeTakeFirstOrThrow()
    ).n,
  )

// Views of the online menu in the week (O3, D-083), or null when the menu isn't
// published: the weekly email shows the line only while it is (SPEC §12.7).
export const menuViewsInPeriod = async (trx: Tx, tenantId: string, from: string, to: string) => {
  const { rows } = await sql<{ published: boolean; qr: number; link: number }>`
    select coalesce((select p.is_published from menu_profiles p where p.tenant_id = ${tenantId}), false) as published,
           coalesce(sum(v.views) filter (where v.source = 'qr'), 0)::int as qr,
           coalesce(sum(v.views) filter (where v.source = 'link'), 0)::int as link
    from menu_views_daily v
    where v.tenant_id = ${tenantId} and v.business_date between ${from}::date and ${to}::date
  `.execute(trx)
  const row = rows[0]
  return row?.published ? { qr: row.qr, link: row.link } : null
}
