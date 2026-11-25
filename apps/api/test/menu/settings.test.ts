import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '../support/app.js'
import { api } from '../support/menu.js'
import { appPool } from '../support/pg.js'
import { auditActions, roleShop, type RoleShop } from '../support/roles.js'

let t: TestApp
let shop: RoleShop
const pool = appPool(1)

beforeAll(async () => {
  t = await createTestApp()
  shop = await roleShop(t.app, 'settings')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

describe('GET /settings', () => {
  it('owner sees everything, including alert settings', async () => {
    const res = await api(t.app, shop.as.owner, 'GET', '/v1/settings')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      timezone: 'Asia/Jakarta',
      tax_name: 'PB1',
      tax_enabled: false,
      enabled_payment_methods: ['cash', 'qris', 'debit', 'credit', 'transfer', 'other'],
      alerts: {
        low_stock_alerts_enabled: true,
        alert_extra_emails: [],
        daily_summary_enabled: true,
        weekly_summary_enabled: true,
      },
    })
  })

  it.each(['manager', 'cashier', 'employee'] as const)(
    '%s gets the subset without alert settings',
    async (role) => {
      const res = await api(t.app, shop.as[role], 'GET', '/v1/settings')
      expect(res.statusCode).toBe(200)
      expect(res.json()).not.toHaveProperty('alerts')
      expect(res.json()).toHaveProperty('tax_bps')
    },
  )
})

describe('PATCH /settings', () => {
  it('owner updates tax and service settings; the change is audited', async () => {
    const res = await api(t.app, shop.as.owner, 'PATCH', '/v1/settings', {
      tax_enabled: true,
      tax_bps: 1000,
      service_charge_enabled: true,
      service_charge_bps: 500,
      enabled_payment_methods: ['qris', 'cash'],
      alert_extra_emails: ['Ops@Example.com', 'ops@example.com'],
      timezone: 'Asia/Makassar',
      receipt_footer: 'Terima kasih!',
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({
      tax_enabled: true,
      tax_bps: 1000,
      service_charge_bps: 500,
      enabled_payment_methods: ['cash', 'qris'],
      timezone: 'Asia/Makassar',
      receipt_footer: 'Terima kasih!',
      alerts: { alert_extra_emails: ['ops@example.com'] },
    })
    const audit = await auditActions(pool, shop.tenantId)
    expect(audit.map((a) => a.action)).toContain('settings.change')
  })

  it('owner turns the report emails off and on (SPEC §12.6)', async () => {
    const off = await api(t.app, shop.as.owner, 'PATCH', '/v1/settings', {
      daily_summary_enabled: false,
      weekly_summary_enabled: false,
    })
    expect(off.statusCode, off.body).toBe(200)
    expect(off.json()).toMatchObject({
      alerts: { daily_summary_enabled: false, weekly_summary_enabled: false },
    })
    const on = await api(t.app, shop.as.owner, 'PATCH', '/v1/settings', { daily_summary_enabled: true })
    expect(on.json()).toMatchObject({
      alerts: { daily_summary_enabled: true, weekly_summary_enabled: false },
    })
  })

  it.each([
    [{ daily_summary_enabled: 'yes' }],
    [{ timezone: 'Mars/Olympus' }],
    [{ tax_bps: 10001 }],
    [{ business_day_cutoff_hour: 7 }],
    [{ enabled_payment_methods: [] }],
    [{ enabled_payment_methods: ['bitcoin'] }],
    [{ tax_name: '   ' }],
    [{ unknown_field: true }],
  ])('rejects %o', async (body) => {
    const res = await api(t.app, shop.as.owner, 'PATCH', '/v1/settings', body)
    expect(res.statusCode, res.body).toBe(400)
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION' } })
  })

  it.each(['manager', 'cashier', 'employee'] as const)('%s may not change settings', async (role) => {
    const res = await api(t.app, shop.as[role], 'PATCH', '/v1/settings', { tax_bps: 0 })
    expect(res.statusCode).toBe(403)
  })
})
