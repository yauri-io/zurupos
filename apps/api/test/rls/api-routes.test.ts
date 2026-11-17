// SPEC §3.6 #6 — every route in the OpenAPI document, called with shop A's
// credentials and shop B's resource ids, answers 404 and never returns B's data.
// The registries below must classify every operation; an unclassified route
// fails the meta-test, so new routes are covered automatically (D-022).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createUser,
  expectStatus,
  headersFor,
  pairDevice,
  APP_HEADERS,
  type Creds,
  type TestApp,
} from '../support/app.js'
import { createTestApp } from '../support/app.js'
import { appPool } from '../support/pg.js'
import { buildFullShop, leakedSecrets, type FullShop } from '../support/shops.js'

type Caller = 'dashboard' | 'staff' | 'device'
type Resource = 'user' | 'device'

// Routes with path params. Each param names the kind of resource it addresses.
const ID_ROUTES: Record<string, { caller: Caller; params: Record<string, Resource>; body?: unknown }> = {
  'POST /v1/devices/{id}/revoke': { caller: 'dashboard', params: { id: 'device' } },
  'PATCH /v1/users/{id}': { caller: 'dashboard', params: { id: 'user' }, body: { name: 'Hijacked' } },
  'POST /v1/users/{id}/reset-pin': { caller: 'dashboard', params: { id: 'user' }, body: { pin: '8642' } },
  'POST /v1/users/{id}/deactivate': { caller: 'dashboard', params: { id: 'user' } },
}

// Routes that take resource ids in the body.
const BODY_ID_ROUTES: Record<string, { caller: Caller; body: (b: FullShop) => unknown }> = {
  'POST /v1/device/sessions': { caller: 'device', body: (b) => ({ user_id: b.owner.id, pin: b.owner.pin }) },
}

// Reads without ids: the response must contain nothing of B.
const SCAN_ROUTES: Record<string, Caller[]> = {
  'GET /v1/auth/me': ['dashboard', 'staff'],
  'GET /v1/devices': ['dashboard', 'staff'],
  'GET /v1/users': ['dashboard', 'staff'],
  'GET /v1/device/staff': ['device'],
}

// Routes that take no tenant resource id at all, with the reason.
const NO_TENANT_INPUT: Record<string, string> = {
  'POST /v1/auth/signup': 'creates a new tenant',
  'POST /v1/auth/login': 'pre-tenant; credentials only',
  'POST /v1/auth/logout': 'acts on the caller’s own session',
  'POST /v1/auth/password/forgot': 'pre-tenant; email only',
  'POST /v1/auth/password/reset': 'pre-tenant; single-use token only',
  'POST /v1/auth/invite/accept': 'pre-tenant; single-use token only',
  'POST /v1/devices/pair': 'pre-tenant; credentials only',
  'DELETE /v1/device/sessions/current': 'acts on the caller’s own session',
  'POST /v1/device/heartbeat': 'acts on the caller’s own device',
  'POST /v1/users': 'creates a new row in the caller’s tenant',
}

let t: TestApp
const pool = appPool(2)
let a: FullShop
let b: FullShop
let operations: string[]

beforeAll(async () => {
  t = await createTestApp()
  a = await buildFullShop(t.app, pool, 'A')
  b = await buildFullShop(t.app, pool, 'B')
  const spec = t.app.swagger() as { paths: Record<string, Record<string, unknown>> }
  operations = Object.entries(spec.paths).flatMap(([path, ops]) =>
    Object.keys(ops).map((method) => `${method.toUpperCase()} ${path}`),
  )
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

const credsOf = (shop: FullShop, caller: Caller): Creds => shop[caller]

const idOf = (shop: FullShop, resource: Resource) => (resource === 'user' ? shop.cashier.id : shop.deviceId)

// A throwaway resource in A, so the positive control can't disturb other tests.
const freshA = async (resource: Resource) =>
  resource === 'user'
    ? (await createUser(t.app, a.ownerCookie, { name: 'Control', role: 'cashier', pin: '4826' })).id
    : (await pairDevice(t.app, a.owner.email, a.owner.password, 'Control')).device.id

const call = (key: string, creds: Creds, url: string, body?: unknown) => {
  const [method] = key.split(' ')
  const headers = { ...APP_HEADERS, ...headersFor(creds) }
  return t.app.inject({
    method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url,
    headers,
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  })
}

const fill = (path: string, params: Record<string, string>) =>
  path.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? `missing-${name}`)

describe('OpenAPI coverage', () => {
  it('finds the routes', () => {
    expect(operations.length).toBeGreaterThan(10)
  })

  it('classifies every operation exactly once', () => {
    const registries = [ID_ROUTES, BODY_ID_ROUTES, SCAN_ROUTES, NO_TENANT_INPUT].map((r) => Object.keys(r))
    const unclassified = operations.filter((op) => !registries.some((keys) => keys.includes(op)))
    const duplicated = operations.filter((op) => registries.filter((keys) => keys.includes(op)).length > 1)
    const stale = registries.flat().filter((key) => !operations.includes(key))
    expect({ unclassified, duplicated, stale }).toEqual({ unclassified: [], duplicated: [], stale: [] })
  })

  it('every route with path params is in ID_ROUTES', () => {
    const withParams = operations.filter((op) => op.includes('{'))
    expect(withParams.filter((op) => !(op in ID_ROUTES))).toEqual([])
  })

  it('no GET route is in NO_TENANT_INPUT (reads must be scanned)', () => {
    expect(Object.keys(NO_TENANT_INPUT).filter((k) => k.startsWith('GET '))).toEqual([])
  })
})

describe("A's credentials + B's ids → 404", () => {
  it.each(Object.entries(ID_ROUTES))('%s', async (key, route) => {
    const path = key.split(' ')[1] ?? ''
    const bParams = Object.fromEntries(Object.entries(route.params).map(([p, r]) => [p, idOf(b, r)]))
    const res = await call(key, credsOf(a, route.caller), fill(path, bParams), route.body)
    expect(res.statusCode, res.body).toBe(404)
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
    expect(leakedSecrets(res.body, b)).toEqual([])

    // Positive control: the same call on A's own resource is not a 404.
    const aParams: Record<string, string> = {}
    for (const [p, r] of Object.entries(route.params)) aParams[p] = await freshA(r)
    const own = await call(key, credsOf(a, route.caller), fill(path, aParams), route.body)
    expect(own.statusCode, own.body).toBeLessThan(400)
  })

  it.each(Object.entries(BODY_ID_ROUTES))('%s (ids in body)', async (key, route) => {
    const path = key.split(' ')[1] ?? ''
    const res = await call(key, credsOf(a, route.caller), path, route.body(b))
    expect(res.statusCode, res.body).toBe(404)
    expect(leakedSecrets(res.body, b)).toEqual([])
  })

  it("B's resources are untouched afterwards", async () => {
    const users = expectStatus(await call('GET /v1/users', b.dashboard, '/v1/users'), 200).json<{
      users: { id: string; name: string; is_active: boolean }[]
    }>().users
    const cashier = users.find((u) => u.id === b.cashier.id)
    expect(cashier).toMatchObject({ is_active: true, name: b.cashier.name })
    const devices = expectStatus(await call('GET /v1/devices', b.dashboard, '/v1/devices'), 200).json<{
      devices: { id: string; revoked_at: string | null }[]
    }>().devices
    expect(devices.find((d) => d.id === b.deviceId)?.revoked_at).toBeNull()
  })
})

describe("reads as A never contain B's data", () => {
  const cases = Object.entries(SCAN_ROUTES).flatMap(([key, callers]) => callers.map((c) => [key, c] as const))
  it.each(cases)('%s as %s', async (key, caller) => {
    const path = key.split(' ')[1] ?? ''
    const res = expectStatus(await call(key, credsOf(a, caller), path), 200)
    expect(leakedSecrets(res.body, b)).toEqual([])
    // Sanity: the scan would notice A's own data, so it is not vacuous.
    expect(leakedSecrets(res.body, a).length).toBeGreaterThan(0)
  })
})
