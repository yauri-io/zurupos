// SPEC §5.2–5.3 — device pairing, staff picker, PIN sessions and lockout.
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLimiters } from '../../src/http/rate-limit.js'
import {
  APP_HEADERS,
  createManager,
  createTestApp,
  createUser,
  expectStatus,
  headersFor,
  pairDevice,
  pinLogin,
  signupShop,
  staffLogin,
  type Shop,
  type StaffUser,
  type TestApp,
} from '../support/app.js'
import { appPool, inTx, type Row } from '../support/pg.js'

let t: TestApp
let shop: Shop
let cashier: StaffUser
let deviceToken: string
let deviceId: string
const pool = appPool(2)

beforeAll(async () => {
  t = await createTestApp()
  shop = await signupShop(t.app, 'device')
  cashier = await createUser(t.app, shop.ownerCookie, {
    name: `${shop.marker} cashier`,
    role: 'cashier',
    pin: '4826',
  })
  const paired = await pairDevice(t.app, shop.owner.email, shop.owner.password)
  deviceToken = paired.device_token
  deviceId = paired.device.id
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

const me = (headers: Record<string, string>) => t.app.inject({ method: 'GET', url: '/v1/auth/me', headers })

describe('pairing', () => {
  it('returns a device token once and stores only its hash', async () => {
    expect(deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const hash = createHash('sha256').update(deviceToken).digest()
    const rows = await inTx(
      pool,
      shop.tenantId,
      async (c) =>
        (await c.query<Row>('select id, paired_by_user_id from devices where token_hash = $1', [hash])).rows,
    )
    expect(rows).toEqual([{ id: deviceId, paired_by_user_id: shop.owner.id }])
  })

  it('works with manager credentials', async () => {
    const manager = await createManager(t.app, shop)
    const paired = await pairDevice(t.app, manager.email ?? '', manager.password ?? '', 'Kasir Manajer')
    expect(paired.device.name).toBe('Kasir Manajer')
  })

  it('rejects wrong credentials with the generic error', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/devices/pair',
      headers: APP_HEADERS,
      payload: { email: shop.owner.email, password: 'wrong-password', device_name: 'X' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('writes a device.pair audit entry', async () => {
    const rows = await inTx(
      pool,
      shop.tenantId,
      async (c) =>
        (
          await c.query<Row>(
            `select actor_user_id from audit_log where action = 'device.pair' and entity_id = $1`,
            [deviceId],
          )
        ).rows,
    )
    expect(rows).toEqual([{ actor_user_id: shop.owner.id }])
  })
})

describe('staff picker', () => {
  it('lists active users with id, name and role only', async () => {
    const res = expectStatus(
      await t.app.inject({
        method: 'GET',
        url: '/v1/device/staff',
        headers: { 'x-device-token': deviceToken },
      }),
      200,
    )
    const staff = res.json<{ staff: Record<string, unknown>[] }>().staff
    expect(staff.map((s) => s['id'])).toEqual(expect.arrayContaining([shop.owner.id, cashier.id]))
    for (const s of staff) expect(Object.keys(s).sort()).toEqual(['id', 'name', 'role'])
  })

  it('requires a valid device token', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/v1/device/staff' })).statusCode).toBe(401)
    const forged = await t.app.inject({
      method: 'GET',
      url: '/v1/device/staff',
      headers: { 'x-device-token': 'B'.repeat(43) },
    })
    expect(forged.statusCode).toBe(401)
  })

  it('a dashboard cookie is not a device token', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/v1/device/staff',
      headers: headersFor({ kind: 'dashboard', cookie: shop.ownerCookie }),
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('PIN sessions', () => {
  it('a correct PIN creates a 12 h staff session usable with both tokens', async () => {
    const res = expectStatus(await pinLogin(t.app, deviceToken, cashier.id, cashier.pin), 201)
    const body = res.json<{ staff_token: string; expires_at: string; user: { role: string } }>()
    expect(body.user.role).toBe('cashier')
    const hours = (new Date(body.expires_at).getTime() - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(11.9)
    expect(hours).toBeLessThanOrEqual(12)
    const ctx = expectStatus(
      await me(headersFor({ kind: 'staff', deviceToken, staffToken: body.staff_token })),
      200,
    )
    expect(ctx.json()).toMatchObject({
      session: { kind: 'staff', device_id: deviceId },
      user: { id: cashier.id },
    })
  })

  it('the staff token alone (without the device token) is rejected', async () => {
    const staffToken = await staffLogin(t.app, deviceToken, cashier.id, cashier.pin)
    expect((await me({ authorization: `Bearer ${staffToken}` })).statusCode).toBe(401)
  })

  it('a staff token is bound to the device that created it', async () => {
    const other = await pairDevice(t.app, shop.owner.email, shop.owner.password, 'Kasir 2')
    const staffToken = await staffLogin(t.app, deviceToken, cashier.id, cashier.pin)
    const res = await me(headersFor({ kind: 'staff', deviceToken: other.device_token, staffToken }))
    expect(res.statusCode).toBe(401)
  })

  it('a dashboard session token cannot be used as a staff token', async () => {
    const res = await me(headersFor({ kind: 'staff', deviceToken, staffToken: shop.ownerCookie }))
    expect(res.statusCode).toBe(401)
  })

  it('wrong PIN 5× locks that user on that device for 5 minutes', async () => {
    const user = await createUser(t.app, shop.ownerCookie, { name: 'Locky', role: 'cashier', pin: '7395' })
    const statuses: number[] = []
    for (let i = 0; i < 5; i++)
      statuses.push((await pinLogin(t.app, deviceToken, user.id, '9999')).statusCode)
    expect(statuses).toEqual([401, 401, 401, 401, 423])

    const locked = await pinLogin(t.app, deviceToken, user.id, user.pin)
    expect(locked.statusCode).toBe(423)
    const until = new Date(
      locked.json<{ error: { details: { locked_until: string } } }>().error.details.locked_until,
    )
    const minutes = (until.getTime() - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(4.9)
    expect(minutes).toBeLessThanOrEqual(5)

    // Another device is unaffected.
    const other = await pairDevice(t.app, shop.owner.email, shop.owner.password, 'Kasir 3')
    expectStatus(await pinLogin(t.app, other.device_token, user.id, user.pin), 201)

    // Once the lock expires, the right PIN works and the counter resets.
    await inTx(pool, shop.tenantId, (c) =>
      c.query(`update pin_attempts set locked_until = now() - interval '1 second' where user_id = $1`, [
        user.id,
      ]),
    )
    expectStatus(await pinLogin(t.app, deviceToken, user.id, user.pin), 201)
    const counters = await inTx(
      pool,
      shop.tenantId,
      async (c) =>
        (
          await c.query<Row>('select failed_count from pin_attempts where user_id = $1 and device_id = $2', [
            user.id,
            deviceId,
          ])
        ).rows,
    )
    expect(counters).toEqual([{ failed_count: 0 }])
  })

  it('a success resets the consecutive-failure count', async () => {
    const user = await createUser(t.app, shop.ownerCookie, { name: 'Resetty', role: 'cashier', pin: '7395' })
    for (let i = 0; i < 4; i++) await pinLogin(t.app, deviceToken, user.id, '9999')
    expectStatus(await pinLogin(t.app, deviceToken, user.id, user.pin), 201)
    for (let i = 0; i < 4; i++)
      expect((await pinLogin(t.app, deviceToken, user.id, '9999')).statusCode).toBe(401)
  })

  it('an owner PIN reset clears the lockout', async () => {
    const user = await createUser(t.app, shop.ownerCookie, {
      name: 'Forgetful',
      role: 'employee',
      pin: '7395',
    })
    for (let i = 0; i < 5; i++) await pinLogin(t.app, deviceToken, user.id, '9999')
    expectStatus(
      await t.app.inject({
        method: 'POST',
        url: `/v1/users/${user.id}/reset-pin`,
        headers: headersFor({ kind: 'dashboard', cookie: shop.ownerCookie }),
        payload: { pin: '8642' },
      }),
      204,
    )
    expectStatus(await pinLogin(t.app, deviceToken, user.id, '8642'), 201)
  })

  it('a deactivated user cannot PIN in', async () => {
    const user = await createUser(t.app, shop.ownerCookie, { name: 'Leaver', role: 'cashier', pin: '7395' })
    const staffToken = await staffLogin(t.app, deviceToken, user.id, user.pin)
    await t.app.inject({
      method: 'POST',
      url: `/v1/users/${user.id}/deactivate`,
      headers: headersFor({ kind: 'dashboard', cookie: shop.ownerCookie }),
    })
    expect((await pinLogin(t.app, deviceToken, user.id, user.pin)).statusCode).toBe(404)
    expect((await me(headersFor({ kind: 'staff', deviceToken, staffToken }))).statusCode).toBe(401)
  })

  it('switch user revokes the current staff session server-side', async () => {
    const staffToken = await staffLogin(t.app, deviceToken, cashier.id, cashier.pin)
    const headers = headersFor({ kind: 'staff', deviceToken, staffToken })
    expectStatus(await t.app.inject({ method: 'DELETE', url: '/v1/device/sessions/current', headers }), 204)
    expect((await me(headers)).statusCode).toBe(401)
  })

  it('limits PIN attempts per device (30 / 5 min)', async () => {
    const strict = await createTestApp({ limiters: createLimiters() })
    try {
      const statuses: number[] = []
      for (let i = 0; i < 31; i++) {
        statuses.push(
          (await pinLogin(strict.app, deviceToken, '00000000-0000-4000-8000-000000000000', '9999'))
            .statusCode,
        )
      }
      expect(statuses.slice(0, 30).every((s) => s === 404)).toBe(true)
      expect(statuses[30]).toBe(429)
    } finally {
      await strict.close()
    }
  })
})

describe('heartbeat and revoke', () => {
  it('heartbeat records last_seen_at and app version', async () => {
    const res = expectStatus(
      await t.app.inject({
        method: 'POST',
        url: '/v1/device/heartbeat',
        headers: { 'x-device-token': deviceToken },
        payload: { app_version: '0.1.0+1' },
      }),
      200,
    )
    expect(new Date(res.json<{ server_time: string }>().server_time).getTime()).toBeGreaterThan(
      Date.now() - 60_000,
    )
    const rows = await inTx(
      pool,
      shop.tenantId,
      async (c) =>
        (
          await c.query<Row>(
            'select app_version, last_seen_at is not null as seen from devices where id = $1',
            [deviceId],
          )
        ).rows,
    )
    expect(rows).toEqual([{ app_version: '0.1.0+1', seen: true }])
  })

  it('owner sees devices; revoking ends the device and all its staff sessions at once', async () => {
    const paired = await pairDevice(t.app, shop.owner.email, shop.owner.password, 'To Revoke')
    const staffToken = await staffLogin(t.app, paired.device_token, cashier.id, cashier.pin)
    const owner = headersFor({ kind: 'dashboard', cookie: shop.ownerCookie })

    const list = expectStatus(await t.app.inject({ method: 'GET', url: '/v1/devices', headers: owner }), 200)
    expect(list.json<{ devices: { id: string }[] }>().devices.map((d) => d.id)).toContain(paired.device.id)

    expectStatus(
      await t.app.inject({ method: 'POST', url: `/v1/devices/${paired.device.id}/revoke`, headers: owner }),
      204,
    )
    expect(
      (await me(headersFor({ kind: 'staff', deviceToken: paired.device_token, staffToken }))).statusCode,
    ).toBe(401)
    const staff = await t.app.inject({
      method: 'GET',
      url: '/v1/device/staff',
      headers: { 'x-device-token': paired.device_token },
    })
    expect(staff.statusCode).toBe(401)
    const open = await inTx(
      pool,
      shop.tenantId,
      async (c) =>
        (
          await c.query<Row>(
            'select count(*)::int as n from sessions where device_id = $1 and revoked_at is null',
            [paired.device.id],
          )
        ).rows[0],
    )
    expect(open).toEqual({ n: 0 })
  })
})
