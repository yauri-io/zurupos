import type { Tx } from '../../db/with-tenant.js'

const SETTINGS_COLUMNS = [
  'name',
  'address',
  'phone',
  'timezone',
  'business_day_cutoff_hour',
  'receipt_header',
  'receipt_footer',
  'service_charge_enabled',
  'service_charge_bps',
  'tax_enabled',
  'tax_name',
  'tax_bps',
  'tax_on_service_charge',
  'enabled_payment_methods',
  'low_stock_alerts_enabled',
  'alert_extra_emails',
  'idle_lock_minutes',
] as const

export const findSettings = (trx: Tx, tenantId: string) =>
  trx.selectFrom('tenants').select(SETTINGS_COLUMNS).where('id', '=', tenantId).executeTakeFirstOrThrow()

export type SettingsRow = Awaited<ReturnType<typeof findSettings>>

export const updateSettings = (trx: Tx, tenantId: string, patch: Partial<SettingsRow>) =>
  trx
    .updateTable('tenants')
    .set(patch)
    .where('id', '=', tenantId)
    .returning(SETTINGS_COLUMNS)
    .executeTakeFirstOrThrow()
