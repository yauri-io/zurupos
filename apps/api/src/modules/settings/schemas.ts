import { Type } from 'typebox'
import { Body, Email, Name, Nullable } from '../../http/schemas.js'

export const PAYMENT_METHODS = ['cash', 'qris', 'debit', 'credit', 'transfer', 'other'] as const
export const PaymentMethod = Type.Union([
  Type.Literal('cash'),
  Type.Literal('qris'),
  Type.Literal('debit'),
  Type.Literal('credit'),
  Type.Literal('transfer'),
  Type.Literal('other'),
])
const Bps = Type.Integer({ minimum: 0, maximum: 10_000 })
const Text = (maxLength: number) => Nullable(Type.String({ maxLength }))

// Owner-only part of the settings (SPEC §5.5: removed from other roles' responses).
const AlertSettings = Type.Object({
  low_stock_alerts_enabled: Type.Boolean(),
  alert_extra_emails: Type.Array(Type.String()),
  // Report emails to the owner (SPEC §12.6).
  daily_summary_enabled: Type.Boolean(),
  weekly_summary_enabled: Type.Boolean(),
})

export const SettingsResponse = Type.Object({
  name: Type.String(),
  address: Nullable(Type.String()),
  phone: Nullable(Type.String()),
  timezone: Type.String(),
  business_day_cutoff_hour: Type.Integer(),
  receipt_header: Nullable(Type.String()),
  receipt_footer: Nullable(Type.String()),
  service_charge_enabled: Type.Boolean(),
  service_charge_bps: Type.Integer(),
  tax_enabled: Type.Boolean(),
  tax_name: Type.String(),
  tax_bps: Type.Integer(),
  tax_on_service_charge: Type.Boolean(),
  enabled_payment_methods: Type.Array(PaymentMethod),
  idle_lock_minutes: Type.Integer(),
  alerts: Type.Optional(AlertSettings),
})

export const UpdateSettingsBody = Body({
  name: Type.Optional(Name(120)),
  address: Type.Optional(Text(300)),
  phone: Type.Optional(Text(40)),
  timezone: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  business_day_cutoff_hour: Type.Optional(Type.Integer({ minimum: 0, maximum: 6 })),
  receipt_header: Type.Optional(Text(500)),
  receipt_footer: Type.Optional(Text(500)),
  service_charge_enabled: Type.Optional(Type.Boolean()),
  service_charge_bps: Type.Optional(Bps),
  tax_enabled: Type.Optional(Type.Boolean()),
  tax_name: Type.Optional(Name(40)),
  tax_bps: Type.Optional(Bps),
  tax_on_service_charge: Type.Optional(Type.Boolean()),
  enabled_payment_methods: Type.Optional(
    Type.Array(PaymentMethod, { minItems: 1, maxItems: PAYMENT_METHODS.length, uniqueItems: true }),
  ),
  low_stock_alerts_enabled: Type.Optional(Type.Boolean()),
  alert_extra_emails: Type.Optional(Type.Array(Email, { maxItems: 5, uniqueItems: true })),
  daily_summary_enabled: Type.Optional(Type.Boolean()),
  weekly_summary_enabled: Type.Optional(Type.Boolean()),
  idle_lock_minutes: Type.Optional(Type.Integer({ minimum: 0, maximum: 240 })),
})
