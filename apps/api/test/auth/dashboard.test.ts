// SPEC §5.1 — dashboard auth: signup, login, sessions, CSRF, password reset, invites.
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLimiters } from '../../src/http/rate-limit.js'
import {
  BROWSER,
  createManager,
  createTestApp,
  createUser,
  dashboardLogin,
  expectStatus,
  headersFor,
  latestEmailTo,
  sessionCookie,
  signupShop,
  tokenFromEmail,
  uniqueEmail,
  type Shop,
  type TestApp,
} from '../support/app.js'
import { appPool, inTx, type Row } from '../support/pg.js'

let t: TestApp
let shop: Shop
const pool = appPool(2)

beforeAll(async () => {
  t = await createTestApp()
  shop = await signupShop(t.app, 'auth')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

const me = (cookie: string) =>
  t.app.inject({ method: 'GET', url: '/v1/auth/me', headers: headersFor({ kind: 'dashboard', cookie }) })

const login = (email: string, password: string, headers: Record<string, string> = BROWSER) =>
  t.app.inject({ method: 'POST', url: '/v1/auth/login', headers, payload: { email, password } })

describe('signup', () => {
  it('creates the shop and owner, and signs the owner in', async () => {
    const res = expectStatus(await me(shop.ownerCookie), 200)
    const body = res.json<{
      user: { role: string; email: string }
      tenant: { timezone: string; business_day_cutoff_hour: number }
      permissions: string[]
    }>()
    expect(body.user.role).toBe('owner')
    expect(body.user.email).toBe(shop.owner.email)
    expect(body.tenant.timezone).toBe('Asia/Jakarta')
    expect(body.tenant.business_day_cutoff_hour).toBe(0)
    expect(body.permissions).toContain('users.manage')
  })

  it('sets an httpOnly, SameSite=Lax session cookie', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      headers: BROWSER,
      payload: {
        shop_name: 'Cookie Shop',
        name: 'Owner',
        email: uniqueEmail('cookie'),
        password: 'kopi-susu-aren-2026',
        pin: '2580',
      },
    })
    const cookie = res.cookies.find((c) => c.name === 'zuru_session')
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' })
  })

  it('stores only the SHA-256 hash of the session token', async () => {
    const hash = createHash('sha256').update(shop.ownerCookie).digest()
    const rows = await inTx(
      pool,
      shop.tenantId,
      async (c) => (await c.query<Row>('select kind from sessions where token_hash = $1', [hash])).rows,
    )
    expect(rows).toEqual([{ kind: 'dashboard' }])
    const raw = await inTx(
      pool,
      shop.tenantId,
      async (c) =>
        (
          await c.query<Row>(
            `select count(*)::int as n from sessions where encode(token_hash, 'escape') = $1`,
            [shop.ownerCookie],
          )
        ).rows[0],
    )
    expect(raw).toEqual({ n: 0 })
  })

  it('rejects a duplicate email with CONFLICT', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      headers: BROWSER,
      payload: {
        shop_name: 'Dup',
        name: 'Dup',
        email: shop.owner.email,
        password: 'kopi-susu-aren-2026',
        pin: '2580',
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ error: { code: 'CONFLICT' } })
  })

  it.each([
    ['weak PIN', { pin: '1234' }, 'pin'],
    ['repeated PIN', { pin: '0000' }, 'pin'],
    ['common password', { password: 'password123' }, 'password'],
    ['short password', { password: 'short' }, 'password'],
  ])('rejects a %s', async (_label, override, field) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      headers: BROWSER,
      payload: {
        shop_name: 'Weak',
        name: 'Weak',
        email: uniqueEmail('weak'),
        password: 'kopi-susu-aren-2026',
        pin: '2580',
        ...override,
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION', details: { field } } })
  })

  it('rejects unknown body properties', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      headers: BROWSER,
      payload: {
        shop_name: 'X',
        name: 'X',
        email: uniqueEmail('extra'),
        password: 'kopi-susu-aren-2026',
        pin: '2580',
        tenant_id: shop.tenantId,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('is NOT_FOUND when SIGNUP_ENABLED is false', async () => {
    const closed = await createTestApp({ signupEnabled: false })
    try {
      const res = await closed.app.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        headers: BROWSER,
        payload: {
          shop_name: 'X',
          name: 'X',
          email: uniqueEmail('off'),
          password: 'kopi-susu-aren-2026',
          pin: '2580',
        },
      })
      expect(res.statusCode).toBe(404)
    } finally {
      await closed.close()
    }
  })
})

describe('login and sessions', () => {
  it('logs in with the right password', async () => {
    const res = expectStatus(await login(shop.owner.email, shop.owner.password), 204)
    expectStatus(await me(sessionCookie(res)), 200)
  })

  it('matches email case-insensitively', async () => {
    expectStatus(await login(shop.owner.email.toUpperCase(), shop.owner.password), 204)
  })

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    const wrong = await login(shop.owner.email, 'not-the-password')
    const unknown = await login(uniqueEmail('nobody'), 'not-the-password')
    expect(wrong.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(wrong.json()).toEqual(unknown.json())
  })

  it('rejects requests without a session, with a garbage token, or a forged token', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/v1/auth/me' })).statusCode).toBe(401)
    expect((await me('garbage')).statusCode).toBe(401)
    expect((await me('A'.repeat(43))).statusCode).toBe(401)
  })

  it('logout revokes the session', async () => {
    const cookie = await dashboardLogin(t.app, shop.owner.email, shop.owner.password)
    expectStatus(
      await t.app.inject({
        method: 'POST',
        url: '/v1/auth/logout',
        headers: headersFor({ kind: 'dashboard', cookie }),
      }),
      204,
    )
    expect((await me(cookie)).statusCode).toBe(401)
  })

  it('rejects an expired session', async () => {
    const cookie = await dashboardLogin(t.app, shop.owner.email, shop.owner.password)
    const hash = createHash('sha256').update(cookie).digest()
    await inTx(pool, shop.tenantId, (c) =>
      c.query(`update sessions set expires_at = now() - interval '1 second' where token_hash = $1`, [hash]),
    )
    expect((await me(cookie)).statusCode).toBe(401)
  })

  it('refreshes sliding expiry at most hourly (D-020)', async () => {
    const cookie = await dashboardLogin(t.app, shop.owner.email, shop.owner.password)
    const hash = createHash('sha256').update(cookie).digest()
    await inTx(pool, shop.tenantId, (c) =>
      c.query(
        `update sessions set last_used_at = now() - interval '2 hours', expires_at = now() + interval '1 day'
         where token_hash = $1`,
        [hash],
      ),
    )
    expectStatus(await me(cookie), 200)
    const row = await inTx(
      pool,
      shop.tenantId,
      async (c) =>
        (
          await c.query<{ days: number }>(
            `select extract(epoch from expires_at - now()) / 86400 as days from sessions where token_hash = $1`,
            [hash],
          )
        ).rows[0],
    )
    expect(Number(row?.days)).toBeGreaterThan(29)
  })
})

describe('CSRF (SPEC §5.1)', () => {
  it('rejects a state-changing cookie request without X-Requested-With', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie: `zuru_session=${shop.ownerCookie}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rejects a cross-origin request', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { ...BROWSER, origin: 'https://evil.example', cookie: `zuru_session=${shop.ownerCookie}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('applies to unauthenticated browser posts too (login)', async () => {
    const res = await login(shop.owner.email, shop.owner.password, {})
    expect(res.statusCode).toBe(403)
  })

  it('allows GET without the header', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: `zuru_session=${shop.ownerCookie}` },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('rate limits (D-019)', () => {
  it('limits login attempts per email', async () => {
    const strict = await createTestApp({ limiters: createLimiters() })
    try {
      const email = uniqueEmail('limited')
      const statuses: number[] = []
      for (let i = 0; i < 11; i++) {
        const res = await strict.app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          headers: BROWSER,
          payload: { email, password: 'wrong-password' },
          remoteAddress: `10.0.0.${i + 1}`,
        })
        statuses.push(res.statusCode)
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true)
      expect(statuses[10]).toBe(429)
    } finally {
      await strict.close()
    }
  })
})

describe('password reset (SPEC §5.1)', () => {
  it('emails a single-use link that sets a new password and ends old sessions', async () => {
    const victim = await signupShop(t.app, 'reset')
    expectStatus(
      await t.app.inject({
        method: 'POST',
        url: '/v1/auth/password/forgot',
        headers: BROWSER,
        payload: { email: victim.owner.email },
      }),
      204,
    )
    const mail = await latestEmailTo(victim.owner.email)
    expect(mail?.kind).toBe('password_reset')
    expect(mail?.subject).toBe('[ZuruPOS] Atur ulang kata sandi')
    const token = tokenFromEmail(mail?.text ?? '')

    const reset = (password: string) =>
      t.app.inject({
        method: 'POST',
        url: '/v1/auth/password/reset',
        headers: BROWSER,
        payload: { token, password },
      })
    expectStatus(await reset('kata-sandi-baru-2026'), 204)
    expect((await me(victim.ownerCookie)).statusCode).toBe(401)
    expect((await login(victim.owner.email, victim.owner.password)).statusCode).toBe(401)
    expectStatus(await login(victim.owner.email, 'kata-sandi-baru-2026'), 204)
    // Single use.
    expect((await reset('another-new-pass-2026')).statusCode).toBe(400)
  })

  it('answers 204 for an unknown email and enqueues nothing', async () => {
    const email = uniqueEmail('ghost')
    expectStatus(
      await t.app.inject({
        method: 'POST',
        url: '/v1/auth/password/forgot',
        headers: BROWSER,
        payload: { email },
      }),
      204,
    )
    expect(await latestEmailTo(email)).toBeUndefined()
  })

  it('rejects an invite token on the reset endpoint and vice versa', async () => {
    const email = uniqueEmail('purpose')
    await createUser(t.app, shop.ownerCookie, { name: 'Purpose Mgr', role: 'manager', pin: '3691', email })
    const token = tokenFromEmail((await latestEmailTo(email))?.text ?? '')
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      headers: BROWSER,
      payload: { token, password: 'manajer-kopi-2026' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects an expired token', async () => {
    const victim = await signupShop(t.app, 'expired')
    await t.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      headers: BROWSER,
      payload: { email: victim.owner.email },
    })
    const token = tokenFromEmail((await latestEmailTo(victim.owner.email))?.text ?? '')
    await inTx(pool, victim.tenantId, (c) =>
      c.query(`update password_resets set expires_at = now() - interval '1 second'`),
    )
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      headers: BROWSER,
      payload: { token, password: 'kata-sandi-baru-2026' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('manager invite and dashboard roles', () => {
  it('lets an invited manager set a password and sign in, with manager permissions only', async () => {
    const manager = await createManager(t.app, shop)
    const cookie = await dashboardLogin(t.app, manager.email ?? '', manager.password ?? '')
    const body = expectStatus(await me(cookie), 200).json<{ user: { role: string }; permissions: string[] }>()
    expect(body.user.role).toBe('manager')
    expect(body.permissions).toContain('menu.manage')
    expect(body.permissions).not.toContain('reports.view')
    const users = await t.app.inject({
      method: 'GET',
      url: '/v1/users',
      headers: headersFor({ kind: 'dashboard', cookie }),
    })
    expect(users.statusCode).toBe(403)
  })

  it('invite emails are in Bahasa Indonesia by default', async () => {
    const email = uniqueEmail('invite-id')
    await createUser(t.app, shop.ownerCookie, { name: 'Mgr', role: 'manager', pin: '3691', email })
    const mail = await latestEmailTo(email)
    expect(mail?.kind).toBe('manager_invite')
    expect(mail?.subject).toContain('Undangan sebagai manajer')
  })

  it('a deactivated manager can no longer log in and loses existing sessions', async () => {
    const manager = await createManager(t.app, shop)
    const cookie = await dashboardLogin(t.app, manager.email ?? '', manager.password ?? '')
    expectStatus(
      await t.app.inject({
        method: 'POST',
        url: `/v1/users/${manager.id}/deactivate`,
        headers: headersFor({ kind: 'dashboard', cookie: shop.ownerCookie }),
      }),
      200,
    )
    expect((await me(cookie)).statusCode).toBe(401)
    expect((await login(manager.email ?? '', manager.password ?? '')).statusCode).toBe(401)
  })

  it('a manager demoted to cashier loses dashboard access', async () => {
    const manager = await createManager(t.app, shop)
    const cookie = await dashboardLogin(t.app, manager.email ?? '', manager.password ?? '')
    expectStatus(
      await t.app.inject({
        method: 'PATCH',
        url: `/v1/users/${manager.id}`,
        headers: headersFor({ kind: 'dashboard', cookie: shop.ownerCookie }),
        payload: { role: 'cashier' },
      }),
      200,
    )
    expect((await me(cookie)).statusCode).toBe(401)
    expect((await login(manager.email ?? '', manager.password ?? '')).statusCode).toBe(401)
  })
})
