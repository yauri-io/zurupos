// SPEC §3.6 #8 — 50 concurrent requests alternating tenants on a pool of 2
// connections: every response contains only its own tenant's data.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, expectStatus, headersFor, type TestApp } from '../support/app.js'
import { appPool } from '../support/pg.js'
import { buildFullShop, leakedSecrets, publishMenu, type FullShop } from '../support/shops.js'

let t: TestApp
const pool = appPool(2)
let a: FullShop
let b: FullShop

beforeAll(async () => {
  t = await createTestApp({ poolMax: 2 })
  a = await buildFullShop(t.app, pool, 'A')
  b = await buildFullShop(t.app, pool, 'B')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

describe('connection pooling', () => {
  it('keeps tenant context per transaction under concurrency', async () => {
    const shops = Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? a : b))
    const results = await Promise.all(
      shops.map(async (shop, i) => {
        // Mix dashboard and staff callers, and two different routes.
        const creds = i % 4 < 2 ? shop.dashboard : shop.staff
        const url = i % 3 === 0 ? '/v1/auth/me' : '/v1/users'
        const res = await t.app.inject({ method: 'GET', url, headers: headersFor(creds) })
        return { shop, other: shop === a ? b : a, url, res }
      }),
    )
    for (const { shop, other, url, res } of results) {
      expectStatus(res, 200)
      expect(leakedSecrets(res.body, other), `${shop.label} ${url}`).toEqual([])
      if (url === '/v1/auth/me') expect(res.json<{ tenant: { id: string } }>().tenant.id).toBe(shop.tenantId)
      else expect(res.body).toContain(shop.marker)
    }
  })

  // §3.6 #9 in #8: public menu reads for A's and B's slugs, interleaved with
  // authenticated ones, on the same 2 connections.
  it('public menu reads stay per shop under concurrency', async () => {
    const slugs = new Map([
      [a, await publishMenu(t.app, a)],
      [b, await publishMenu(t.app, b)],
    ])
    const results = await Promise.all(
      Array.from({ length: 50 }, async (_, i) => {
        const shop = i % 2 === 0 ? a : b
        const res =
          i % 5 === 4
            ? await t.app.inject({ method: 'GET', url: '/v1/users', headers: headersFor(shop.dashboard) })
            : await t.app.inject({ method: 'GET', url: `/v1/public/menus/${slugs.get(shop) ?? ''}` })
        return { shop, other: shop === a ? b : a, res }
      }),
    )
    for (const { shop, other, res } of results) {
      expectStatus(res, 200)
      expect(leakedSecrets(res.body, other), shop.label).toEqual([])
      expect(res.body).toContain(shop.marker)
    }
  })
})
