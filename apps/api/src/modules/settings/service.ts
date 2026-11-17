import { writeAudit } from '../../audit/audit.js'
import type { AuthContext } from '../../auth/context.js'
import { can } from '../../auth/permissions.js'
import type { Tx } from '../../db/with-tenant.js'
import { apiError } from '../../http/errors.js'
import * as q from './queries.js'
import { PAYMENT_METHODS } from './schemas.js'

const TIMEZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])
export const isValidTimezone = (tz: string): boolean => TIMEZONES.has(tz)

const toResponse = (row: q.SettingsRow, withAlerts: boolean) => ({
  name: row.name,
  address: row.address,
  phone: row.phone,
  timezone: row.timezone,
  business_day_cutoff_hour: row.business_day_cutoff_hour,
  receipt_header: row.receipt_header,
  receipt_footer: row.receipt_footer,
  service_charge_enabled: row.service_charge_enabled,
  service_charge_bps: row.service_charge_bps,
  tax_enabled: row.tax_enabled,
  tax_name: row.tax_name,
  tax_bps: row.tax_bps,
  tax_on_service_charge: row.tax_on_service_charge,
  // Keep the canonical order regardless of how it was stored.
  enabled_payment_methods: PAYMENT_METHODS.filter((m) => row.enabled_payment_methods.includes(m)),
  idle_lock_minutes: row.idle_lock_minutes,
  ...(withAlerts
    ? {
        alerts: {
          low_stock_alerts_enabled: row.low_stock_alerts_enabled,
          alert_extra_emails: row.alert_extra_emails,
        },
      }
    : {}),
})

export const getSettings = async (trx: Tx, auth: AuthContext) =>
  toResponse(await q.findSettings(trx, auth.tenantId), can(auth.role, 'settings.manage'))

export const updateSettings = async (trx: Tx, auth: AuthContext, patch: Partial<q.SettingsRow>) => {
  if (patch.timezone !== undefined && !isValidTimezone(patch.timezone)) {
    throw apiError('VALIDATION', { field: 'timezone', problem: 'unknown_timezone' })
  }
  if (patch.alert_extra_emails !== undefined) {
    patch.alert_extra_emails = [...new Set(patch.alert_extra_emails.map((e) => e.toLowerCase()))]
  }
  const fields = Object.keys(patch)
  const row =
    fields.length > 0
      ? await q.updateSettings(trx, auth.tenantId, patch)
      : await q.findSettings(trx, auth.tenantId)
  if (fields.length > 0) {
    await writeAudit(trx, {
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: 'settings.change',
      entityType: 'tenant',
      entityId: auth.tenantId,
      data: { changes: patch },
    })
  }
  return toResponse(row, true)
}
