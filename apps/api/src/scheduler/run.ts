// One scheduler pass (SPEC §12.6): find the shops (D-075), work out what is due
// and send each report in that shop's own tenant transaction. One shop failing
// never stops the others.
import type { Kysely } from 'kysely'
import type { DB } from '../db/types.js'
import { withTenant } from '../db/with-tenant.js'
import { dueReports } from '../domain/report-schedule.js'
import { reportSchedule, type ScheduleRow } from './queries.js'
import { sendReport, type SendOutcome } from './service.js'

export type PassResult = Record<SendOutcome | 'failed', number>

type PassOptions = {
  now: Date
  dashboardUrl: string
  onError: (err: unknown, ctx: Record<string, unknown>) => void
}

// Sends what is due for the given rows of auth.report_schedule().
export const runForShops = async (
  db: Kysely<DB>,
  shops: readonly ScheduleRow[],
  opts: PassOptions,
): Promise<PassResult> => {
  const result: PassResult = { sent: 0, already_sent: 0, no_owner: 0, skipped_empty: 0, failed: 0 }
  for (const shop of shops) {
    const due = dueReports(opts.now, {
      timezone: shop.timezone,
      dailyEnabled: shop.daily_summary_enabled,
      weeklyEnabled: shop.weekly_summary_enabled,
    })
    for (const d of due) {
      try {
        // tenant_id comes from auth.report_schedule(), never from a request (D-075).
        const outcome = await withTenant(db, shop.tenant_id, (trx) =>
          sendReport(trx, shop.tenant_id, d, opts.dashboardUrl),
        )
        result[outcome]++
      } catch (err) {
        result.failed++
        opts.onError(err, { tenantId: shop.tenant_id, kind: d.kind, period: d.periodStart })
      }
    }
  }
  return result
}

export const runPass = async (db: Kysely<DB>, opts: PassOptions): Promise<PassResult> =>
  runForShops(db, await reportSchedule(db), opts)
