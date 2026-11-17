// SPEC §5.5 — the permission table matches PRD §6, and routes enforce it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PERMISSIONS, type Role } from '../../src/auth/permissions.js'
import {
  createManager,
  createTestApp,
  createUser,
  dashboardLogin,
  headersFor,
  pairDevice,
  signupShop,
  staffLogin,
  type Creds,
  type Shop,
  type TestApp,
} from '../support/app.js'

// PRD §6, transcribed independently of src/auth/permissions.ts.
const PRD_MATRIX: Record<string, Role[]> = {
  'orders.create': ['owner', 'manager', 'cashier'],
  'discounts.apply_preset': ['owner', 'manager', 'cashier'],
  'discounts.apply_custom': ['owner', 'manager'],
  'orders.void': ['owner', 'manager'],
  'orders.void_with_approval': ['cashier'],
  'orders.view_today': ['owner', 'manager', 'cashier', 'employee'],
  'orders.reprint_receipt': ['owner', 'manager', 'cashier'],
  'orders.view_all': ['owner'],
  'stock.adjust': ['owner', 'manager', 'employee'],
  'stock.view': ['owner', 'manager', 'cashier', 'employee'],
  'menu.manage': ['owner', 'manager'],
  'menu.availability': ['owner', 'manager', 'cashier'],
  'reports.view': ['owner'],
  'costs.view': ['owner'],
  'users.manage': ['owner'],
  'devices.pair': ['owner', 'manager'],
  'devices.manage': ['owner'],
  'settings.manage': ['owner'],
  'settings.view': ['owner', 'manager', 'cashier', 'employee'],
  'dashboard.access': ['owner', 'manager'],
  'admin.stock_invariant': ['owner'],
}

describe('permission table', () => {
  it('matches the PRD §6 matrix exactly', () => {
    const actual = Object.fromEntries(Object.entries(PERMISSIONS).map(([k, v]) => [k, [...v].sort()]))
    const expected = Object.fromEntries(Object.entries(PRD_MATRIX).map(([k, v]) => [k, [...v].sort()]))
    expect(actual).toEqual(expected)
  })
})

describe('route guards', () => {
  let t: TestApp
  let shop: Shop
  const creds: Partial<Record<'ownerDashboard' | 'managerDashboard' | Role, Creds>> = {}

  beforeAll(async () => {
    t = await createTestApp()
    shop = await signupShop(t.app, 'perm')
    const manager = await createManager(t.app, shop)
    const cashier = await createUser(t.app, shop.ownerCookie, { name: 'C', role: 'cashier', pin: '4826' })
    const employee = await createUser(t.app, shop.ownerCookie, { name: 'E', role: 'employee', pin: '4826' })
    const { device_token: deviceToken } = await pairDevice(t.app, shop.owner.email, shop.owner.password)
    creds.ownerDashboard = { kind: 'dashboard', cookie: shop.ownerCookie }
    creds.managerDashboard = {
      kind: 'dashboard',
      cookie: await dashboardLogin(t.app, manager.email ?? '', manager.password ?? ''),
    }
    for (const [role, user] of [
      ['owner', { id: shop.owner.id, pin: shop.owner.pin }],
      ['manager', manager],
      ['cashier', cashier],
      ['employee', employee],
    ] as const) {
      creds[role] = {
        kind: 'staff',
        deviceToken,
        staffToken: await staffLogin(t.app, deviceToken, user.id, user.pin),
      }
    }
  })
  afterAll(() => t.close())

  const status = async (who: keyof typeof creds, method: 'GET' | 'POST', url: string) => {
    const c = creds[who]
    if (!c) throw new Error(`no creds for ${who}`)
    return (
      await t.app.inject({ method, url, headers: headersFor(c), payload: method === 'POST' ? {} : undefined })
    ).statusCode
  }

  it.each([
    ['ownerDashboard', 200],
    ['owner', 200],
    ['managerDashboard', 403],
    ['manager', 403],
    ['cashier', 403],
    ['employee', 403],
  ] as const)('GET /v1/users as %s → %i', async (who, expected) => {
    expect(await status(who, 'GET', '/v1/users')).toBe(expected)
  })

  it.each([
    ['ownerDashboard', 200],
    ['managerDashboard', 403],
    ['cashier', 403],
  ] as const)('GET /v1/devices as %s → %i', async (who, expected) => {
    expect(await status(who, 'GET', '/v1/devices')).toBe(expected)
  })

  it('every role can read its own /auth/me', async () => {
    for (const who of [
      'ownerDashboard',
      'managerDashboard',
      'owner',
      'manager',
      'cashier',
      'employee',
    ] as const) {
      expect(await status(who, 'GET', '/v1/auth/me'), who).toBe(200)
    }
  })

  it('a forbidden route returns FORBIDDEN, not the data', async () => {
    const c = creds.cashier
    if (!c) throw new Error('no cashier')
    const res = await t.app.inject({ method: 'GET', url: '/v1/users', headers: headersFor(c) })
    expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })
    expect(res.body).not.toContain(shop.owner.email)
  })
})
