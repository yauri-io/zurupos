// SPEC §3.6 #6 — every route in the OpenAPI document, called with shop A's
// credentials and shop B's resource ids, answers 404 and never returns B's data.
// The registries below must classify every operation; an unclassified route
// fails the meta-test, so new routes are covered automatically (D-022).
import { randomUUID } from 'node:crypto'
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
import * as menu from '../support/menu.js'
import { appPool, inTx } from '../support/pg.js'
import { buildFullShop, leakedSecrets, type FullShop } from '../support/shops.js'

type Caller = 'dashboard' | 'staff' | 'device'
type Resource =
  | 'user'
  | 'device'
  | 'category'
  | 'item'
  | 'modifier_group'
  | 'modifier_option'
  | 'ingredient'
  | 'discount'
  | 'order'

// Routes with path params. Each param names the kind of resource it addresses.
const ID_ROUTES: Record<string, { caller: Caller; params: Record<string, Resource>; body?: unknown }> = {
  'POST /v1/devices/{id}/revoke': { caller: 'dashboard', params: { id: 'device' } },
  'PATCH /v1/users/{id}': { caller: 'dashboard', params: { id: 'user' }, body: { name: 'Hijacked' } },
  'POST /v1/users/{id}/reset-pin': { caller: 'dashboard', params: { id: 'user' }, body: { pin: '8642' } },
  'POST /v1/users/{id}/deactivate': { caller: 'dashboard', params: { id: 'user' } },
  'PATCH /v1/categories/{id}': {
    caller: 'dashboard',
    params: { id: 'category' },
    body: { name: 'Hijacked' },
  },
  'DELETE /v1/categories/{id}': { caller: 'dashboard', params: { id: 'category' } },
  'GET /v1/items/{id}': { caller: 'dashboard', params: { id: 'item' } },
  'PATCH /v1/items/{id}': { caller: 'dashboard', params: { id: 'item' }, body: { price: 1 } },
  'PATCH /v1/items/{id}/availability': {
    caller: 'staff',
    params: { id: 'item' },
    body: { is_available: false },
  },
  'PUT /v1/items/{id}/modifier-groups': {
    caller: 'dashboard',
    params: { id: 'item' },
    body: { group_ids: [] },
  },
  'DELETE /v1/items/{id}': { caller: 'dashboard', params: { id: 'item' } },
  'GET /v1/items/{id}/recipe': { caller: 'dashboard', params: { id: 'item' } },
  'PUT /v1/items/{id}/recipe': { caller: 'dashboard', params: { id: 'item' }, body: { lines: [] } },
  'PATCH /v1/modifier-groups/{id}': {
    caller: 'dashboard',
    params: { id: 'modifier_group' },
    body: { name: 'X' },
  },
  'DELETE /v1/modifier-groups/{id}': { caller: 'dashboard', params: { id: 'modifier_group' } },
  'PATCH /v1/modifier-options/{id}': {
    caller: 'dashboard',
    params: { id: 'modifier_option' },
    body: { name: 'X' },
  },
  'DELETE /v1/modifier-options/{id}': { caller: 'dashboard', params: { id: 'modifier_option' } },
  'GET /v1/modifier-options/{id}/effects': { caller: 'dashboard', params: { id: 'modifier_option' } },
  'PUT /v1/modifier-options/{id}/effects': {
    caller: 'dashboard',
    params: { id: 'modifier_option' },
    body: { effects: [] },
  },
  'GET /v1/ingredients/{id}': { caller: 'staff', params: { id: 'ingredient' } },
  'PATCH /v1/ingredients/{id}': {
    caller: 'dashboard',
    params: { id: 'ingredient' },
    body: { low_stock_threshold: '1' },
  },
  'DELETE /v1/ingredients/{id}': { caller: 'dashboard', params: { id: 'ingredient' } },
  'GET /v1/ingredients/{id}/movements': { caller: 'staff', params: { id: 'ingredient' } },
  'PATCH /v1/discounts/{id}': { caller: 'dashboard', params: { id: 'discount' }, body: { value: 1 } },
  'DELETE /v1/discounts/{id}': { caller: 'dashboard', params: { id: 'discount' } },
  'GET /v1/orders/{id}': { caller: 'dashboard', params: { id: 'order' } },
  'POST /v1/orders/{id}/void': {
    caller: 'dashboard',
    params: { id: 'order' },
    body: { reason: 'Hijack', restock: false },
  },
}

// Routes that take resource ids in the body.
const BODY_ID_ROUTES: Record<string, { caller: Caller; body: (b: FullShop) => unknown }> = {
  'POST /v1/device/sessions': { caller: 'device', body: (b) => ({ user_id: b.owner.id, pin: b.owner.pin }) },
  'POST /v1/items': {
    caller: 'dashboard',
    body: (b) => ({ category_id: b.seeded.categories, name: 'Hijack', price: 1 }),
  },
  'POST /v1/modifier-options': {
    caller: 'dashboard',
    body: (b) => ({ group_id: b.seeded.modifier_groups, name: 'Hijack' }),
  },
  'POST /v1/stock/in': {
    caller: 'staff',
    body: (b) => ({ ingredient_id: b.seeded.ingredients, qty: '1', total_cost: 1 }),
  },
  'POST /v1/stock/waste': {
    caller: 'staff',
    body: (b) => ({ ingredient_id: b.seeded.ingredients, qty: '1', reason: 'spilled' }),
  },
  'POST /v1/stock/count': {
    caller: 'staff',
    body: (b) => ({ counts: [{ ingredient_id: b.seeded.ingredients, counted_qty: '0' }] }),
  },
  'POST /v1/orders': {
    caller: 'staff',
    body: (b) => ({
      client_order_id: randomUUID(),
      order_type: 'takeaway',
      lines: [{ item_id: b.seeded.items, qty: 1 }],
      payments: [{ method: 'qris', amount: 25000 }],
    }),
  },
  'POST /v1/recipes/preview': {
    caller: 'dashboard',
    body: (b) => ({ item_id: b.seeded.items, option_ids: [] }),
  },
}

// Reads without ids: the response must contain nothing of B.
const SCAN_ROUTES: Record<string, Caller[]> = {
  'GET /v1/auth/me': ['dashboard', 'staff'],
  'GET /v1/devices': ['dashboard', 'staff'],
  'GET /v1/users': ['dashboard', 'staff'],
  'GET /v1/device/staff': ['device'],
  'GET /v1/settings': ['dashboard', 'staff'],
  'GET /v1/categories': ['dashboard', 'staff'],
  'GET /v1/items': ['dashboard', 'staff'],
  'GET /v1/modifier-groups': ['dashboard', 'staff'],
  'GET /v1/ingredients': ['dashboard', 'staff'],
  'GET /v1/discounts': ['dashboard', 'staff'],
  'GET /v1/orders/today': ['dashboard', 'staff'],
  'GET /v1/admin/stock-invariant': ['dashboard', 'staff'],
  'GET /v1/device/bootstrap': ['dashboard', 'staff'],
  // Reports with names or ids in them (owner only; queried for today's business date).
  'GET /v1/reports/items': ['dashboard'],
  'GET /v1/reports/categories': ['dashboard'],
  'GET /v1/reports/margin': ['dashboard'],
  'GET /v1/reports/stock-value': ['dashboard'],
  'GET /v1/orders': ['dashboard'],
}

// Reports that are only numbers: nothing to scan for, so each must equal A's own
// figures computed with an explicit `tenant_id = A` (B's seeded order would add to them).
const NUMERIC_REPORTS: Record<string, (r: Json, own: OwnFigures) => unknown[]> = {
  'GET /v1/reports/summary': (r, own) => [r['orders'], own.orders, r['total_collected'], own.total],
  'GET /v1/reports/daily': (r, own) => {
    const day = (r['days'] as Json[])[0] ?? {}
    return [day['orders'], own.orders, day['total_collected'], own.total]
  },
  'GET /v1/reports/hourly': (r, own) => {
    const hours = r['hours'] as Json[]
    return [hours.reduce((n, h) => n + (h['orders'] as number), 0), own.orders]
  },
  'GET /v1/reports/payments': (r, own) => [r['total'], own.payments],
  'GET /v1/reports/voids': (r, own) => [r['count'], own.voids],
}

type Json = Record<string, unknown>
type OwnFigures = { orders: number; total: number; payments: number; voids: number }

// Reports take a date range; the scans use today's business date (seeded orders live there).
const RANGED = (key: string) =>
  (key.startsWith('GET /v1/reports/') && key !== 'GET /v1/reports/stock-value') || key === 'GET /v1/orders'
let today = ''
const withRange = (key: string, path: string) => (RANGED(key) ? `${path}?from=${today}&to=${today}` : path)

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
  'DELETE /v1/device': 'acts on the caller’s own device (D-048)',
  'POST /v1/users': 'creates a new row in the caller’s tenant',
  'PATCH /v1/settings': 'acts on the caller’s own tenant',
  'POST /v1/categories': 'creates a new row in the caller’s tenant',
  'POST /v1/modifier-groups': 'creates a new row in the caller’s tenant',
  'POST /v1/ingredients': 'creates a new row in the caller’s tenant',
  'POST /v1/discounts': 'creates a new row in the caller’s tenant',
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
  for (const shop of [a, b]) await giveReadsSomethingToShow(shop)
  today = await inTx(pool, null, async (c) => {
    const { rows } = await c.query<{ d: string }>(
      `select ((now() at time zone 'Asia/Jakarta'))::date::text as d`,
    )
    return rows[0]?.d ?? ''
  })
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

// The seeded order moves to "today" (GET /orders/today) and an ingredient whose
// stock has no movements shows up in GET /admin/stock-invariant, so the scans
// below have each shop's data to find.
const giveReadsSomethingToShow = (shop: FullShop) =>
  inTx(pool, shop.tenantId, async (c) => {
    await c.query(
      `update orders set business_date = ((now() at time zone 'Asia/Jakarta'))::date where id = $1`,
      [shop.seeded.orders],
    )
    await c.query(`insert into ingredients (tenant_id, name, base_unit, stock_qty) values ($1, $2, 'g', 5)`, [
      shop.tenantId,
      `${shop.marker} unbalanced`,
    ])
  })

const required = (id: string | undefined): string => {
  if (!id) throw new Error('seeded id missing')
  return id
}

const idOf = (shop: FullShop, resource: Resource): string => {
  switch (resource) {
    case 'user':
      return shop.cashier.id
    case 'device':
      return shop.deviceId
    case 'category':
      return required(shop.seeded.categories)
    case 'item':
      return required(shop.seeded.items)
    case 'modifier_group':
      return required(shop.seeded.modifier_groups)
    case 'modifier_option':
      return required(shop.seeded.modifier_options)
    case 'ingredient':
      return required(shop.seeded.ingredients)
    case 'discount':
      return required(shop.seeded.discounts)
    case 'order':
      return required(shop.seeded.orders)
  }
}

// A throwaway resource in A, so the positive control can't disturb other tests.
const freshA = async (resource: Resource): Promise<string> => {
  const d = a.dashboard
  const unique = randomUUID().slice(0, 8)
  switch (resource) {
    case 'user':
      return (await createUser(t.app, a.ownerCookie, { name: 'Control', role: 'cashier', pin: '4826' })).id
    case 'device':
      return (await pairDevice(t.app, a.owner.email, a.owner.password, 'Control')).device.id
    case 'category':
      return (await menu.createCategory(t.app, d, `Control ${unique}`)).id
    case 'item':
      return (await menu.createItem(t.app, d, (await menu.createCategory(t.app, d, `C ${unique}`)).id)).id
    case 'modifier_group':
      return (await menu.createGroup(t.app, d, `Control ${unique}`)).id
    case 'modifier_option':
      return (await menu.createOption(t.app, d, (await menu.createGroup(t.app, d, `G ${unique}`)).id)).id
    case 'ingredient':
      return (await menu.createIngredient(t.app, d, `Control ${unique}`)).id
    case 'discount':
      return (await menu.createDiscount(t.app, d, `Control ${unique}`)).id
    case 'order': {
      const res = expectStatus(
        await t.app.inject({
          method: 'POST',
          url: '/v1/orders',
          headers: { ...APP_HEADERS, ...headersFor(a.staff) },
          payload: {
            client_order_id: randomUUID(),
            order_type: 'takeaway',
            lines: [{ item_id: required(a.seeded.items), qty: 1 }],
            payments: [{ method: 'qris', amount: 25000 }],
          },
        }),
        201,
      )
      return res.json<{ id: string }>().id
    }
  }
}

const call = (key: string, creds: Creds, url: string, body?: unknown) => {
  const [method] = key.split(' ')
  const headers = { ...APP_HEADERS, ...headersFor(creds) }
  return t.app.inject({
    method: method as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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
    const registries = [ID_ROUTES, BODY_ID_ROUTES, SCAN_ROUTES, NUMERIC_REPORTS, NO_TENANT_INPUT].map((r) =>
      Object.keys(r),
    )
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
    const path = withRange(key, key.split(' ')[1] ?? '')
    const res = expectStatus(await call(key, credsOf(a, caller), path), 200)
    expect(leakedSecrets(res.body, b)).toEqual([])
    // Sanity: the scan would notice A's own data, so it is not vacuous.
    expect(leakedSecrets(res.body, a).length).toBeGreaterThan(0)
  })
})

describe("number-only reports as A count only A's orders", () => {
  // Explicit tenant filter, independent of RLS, so a leak can't hide in both sides.
  const ownFigures = () =>
    inTx(pool, a.tenantId, async (c) => {
      const q = async (text: string) =>
        Number((await c.query<{ n: string }>(text, [a.tenantId, today])).rows[0]?.n ?? 0)
      return {
        orders: await q(
          `select count(*) n from orders where tenant_id = $1 and status = 'paid' and business_date = $2`,
        ),
        total: await q(
          `select coalesce(sum(total), 0) n from orders where tenant_id = $1 and status = 'paid' and business_date = $2`,
        ),
        payments: await q(
          `select coalesce(sum(p.amount), 0) n from payments p join orders o on o.id = p.order_id
           where o.tenant_id = $1 and o.status = 'paid' and o.business_date = $2`,
        ),
        voids: await q(
          `select count(*) n from orders where tenant_id = $1 and status = 'voided' and business_date = $2`,
        ),
      }
    })

  it.each(Object.keys(NUMERIC_REPORTS))('%s', async (key) => {
    const own = await ownFigures()
    expect(own.orders, 'A has an order today, so the check is not vacuous').toBeGreaterThan(0)
    const res = expectStatus(await call(key, a.dashboard, withRange(key, key.split(' ')[1] ?? '')), 200)
    const [actual, expected, ...more] = NUMERIC_REPORTS[key]?.(res.json<Json>(), own) ?? []
    expect(actual).toBe(expected)
    for (let i = 0; i < more.length; i += 2) expect(more[i]).toBe(more[i + 1])
  })
})

// Routes on A's own resources whose body references other rows: B's ids there
// must be rejected as NOT_FOUND too (D-022: ids in bodies, covered per module).
describe("A's own resource + B's ids in the body → 404", () => {
  const cases: [string, (b: FullShop) => Promise<{ url: string; method: 'PATCH' | 'PUT'; body: unknown }>][] =
    [
      [
        'PATCH /v1/items/{id} with B category_id',
        async (b) => ({
          method: 'PATCH',
          url: `/v1/items/${await freshA('item')}`,
          body: { category_id: b.seeded.categories },
        }),
      ],
      [
        'PUT /v1/items/{id}/modifier-groups with B group',
        async (b) => ({
          method: 'PUT',
          url: `/v1/items/${await freshA('item')}/modifier-groups`,
          body: { group_ids: [b.seeded.modifier_groups] },
        }),
      ],
      [
        'PUT /v1/items/{id}/recipe with B ingredient',
        async (b) => ({
          method: 'PUT',
          url: `/v1/items/${await freshA('item')}/recipe`,
          body: { lines: [{ ingredient_id: b.seeded.ingredients, qty: '1' }] },
        }),
      ],
      [
        'PUT /v1/modifier-options/{id}/effects with B ingredient',
        async (b) => ({
          method: 'PUT',
          url: `/v1/modifier-options/${await freshA('modifier_option')}/effects`,
          body: { effects: [{ effect: 'add', ingredient_id: b.seeded.ingredients, qty: '5' }] },
        }),
      ],
      [
        'PUT /v1/modifier-options/{id}/effects with B replace target',
        async (b) => ({
          method: 'PUT',
          url: `/v1/modifier-options/${await freshA('modifier_option')}/effects`,
          body: {
            effects: [
              {
                effect: 'replace',
                ingredient_id: await freshA('ingredient'),
                target_ingredient_id: b.seeded.ingredients,
              },
            ],
          },
        }),
      ],
    ]

  it.each(cases)('%s', async (_, build) => {
    const { method, url, body } = await build(b)
    const res = await call(`${method} ${url}`, a.dashboard, url, body)
    expect(res.statusCode, res.body).toBe(404)
    expect(leakedSecrets(res.body, b)).toEqual([])
  })

  it('POST /v1/recipes/preview with A item and B option', async () => {
    const res = await call('POST /v1/recipes/preview', a.dashboard, '/v1/recipes/preview', {
      item_id: await freshA('item'),
      option_ids: [b.seeded.modifier_options],
    })
    expect(res.statusCode, res.body).toBe(404)
  })

  it("B's menu rows are untouched afterwards", async () => {
    const item = expectStatus(await call('GET', b.dashboard, `/v1/items/${b.seeded.items}`), 200).json<{
      price: number
      name: string
      is_available: boolean
      modifier_group_ids: string[]
    }>()
    expect(item).toMatchObject({
      price: 25000,
      is_available: true,
      modifier_group_ids: [b.seeded.modifier_groups],
    })
    const recipe = expectStatus(
      await call('GET', b.dashboard, `/v1/items/${b.seeded.items}/recipe`),
      200,
    ).json<{
      lines: unknown[]
    }>()
    expect(recipe.lines).toHaveLength(1)
    const effects = expectStatus(
      await call('GET', b.dashboard, `/v1/modifier-options/${b.seeded.modifier_options}/effects`),
      200,
    ).json<{ effects: unknown[] }>()
    expect(effects.effects).toHaveLength(1)
    const lists = await Promise.all(
      ['categories', 'modifier-groups', 'ingredients', 'discounts'].map(
        async (path) => expectStatus(await call('GET', b.dashboard, `/v1/${path}`), 200).body,
      ),
    )
    for (const [i, id] of [
      b.seeded.categories,
      b.seeded.modifier_groups,
      b.seeded.ingredients,
      b.seeded.discounts,
    ].entries()) {
      expect(lists[i]).toContain(id)
    }
  })
})
