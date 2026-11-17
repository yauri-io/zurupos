// SPEC §3.6 #7 — a device token from shop A with a user (and PIN) from shop B is rejected.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, headersFor, pinLogin, type TestApp } from '../support/app.js'
import { appPool, inTx, type Row } from '../support/pg.js'
import { buildFullShop, leakedSecrets, type FullShop } from '../support/shops.js'

let t: TestApp
const pool = appPool(2)
let a: FullShop
let b: FullShop

beforeAll(async () => {
  t = await createTestApp()
  a = await buildFullShop(t.app, pool, 'A')
  b = await buildFullShop(t.app, pool, 'B')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

describe('cross-tenant PIN login', () => {
  it("A's device + B's user id + B's correct PIN → rejected, no session created", async () => {
    const res = await pinLogin(t.app, a.deviceToken, b.owner.id, b.owner.pin)
    expect(res.statusCode).toBe(404)
    expect(leakedSecrets(res.body, b)).toEqual([])
    const sessions = await inTx(
      pool,
      b.tenantId,
      async (c) =>
        (await c.query<Row>('select count(*)::int as n from sessions where device_id = $1', [a.deviceId]))
          .rows[0],
    )
    expect(sessions).toEqual({ n: 0 })
  })

  it("A's device token + B's staff token → rejected", async () => {
    if (b.staff.kind !== 'staff') throw new Error('expected staff creds')
    const res = await t.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: headersFor({ kind: 'staff', deviceToken: a.deviceToken, staffToken: b.staff.staffToken }),
    })
    expect(res.statusCode).toBe(401)
  })

  it("B's device token + A's dashboard cookie on a user route → rejected", async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/v1/users',
      headers: { 'x-device-token': b.deviceToken, cookie: `zuru_session=${a.ownerCookie}` },
    })
    expect(res.statusCode).toBe(401)
  })
})
