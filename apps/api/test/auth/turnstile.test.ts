// D-064 — Cloudflare Turnstile on dashboard login.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTurnstileVerifier, type TurnstileResult } from '../../src/auth/turnstile.js'
import {
  BROWSER,
  createTestApp,
  expectStatus,
  sessionCookie,
  signupShop,
  type Shop,
  type TestApp,
} from '../support/app.js'

const GOOD = 'good-token'
const DOWN = 'cloudflare-down'

describe('login with Turnstile on', () => {
  let t: TestApp
  let shop: Shop
  const calls: { token: string; ip: string }[] = []

  beforeAll(async () => {
    t = await createTestApp({
      turnstile: async (token, ip): Promise<TurnstileResult> => {
        calls.push({ token, ip })
        if (token === GOOD) return 'ok'
        return token === DOWN ? 'unavailable' : 'rejected'
      },
    })
    shop = await signupShop(t.app, 'turnstile')
  })
  afterAll(async () => {
    await t.close()
  })

  const login = (payload: Record<string, unknown>) =>
    t.app.inject({ method: 'POST', url: '/v1/auth/login', headers: BROWSER, payload })

  const expectCaptchaFailed = (res: Awaited<ReturnType<typeof login>>) => {
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION', details: { field: 'turnstile_token', problem: 'captcha_failed' } },
    })
    expect(res.cookies.find((c) => c.name === 'zuru_session')).toBeUndefined()
  }

  it('signs in with a valid token, passing the client IP to Cloudflare', async () => {
    const res = expectStatus(
      await login({ email: shop.owner.email, password: shop.owner.password, turnstile_token: GOOD }),
      204,
    )
    expect(sessionCookie(res)).toBeTruthy()
    expect(calls.at(-1)).toEqual({ token: GOOD, ip: '127.0.0.1' })
  })

  it('refuses a login without a token, even with the right password', async () => {
    expectCaptchaFailed(await login({ email: shop.owner.email, password: shop.owner.password }))
  })

  it('refuses a rejected token, even with the right password', async () => {
    expectCaptchaFailed(
      await login({ email: shop.owner.email, password: shop.owner.password, turnstile_token: 'bad' }),
    )
  })

  it('fails closed when Cloudflare is unreachable', async () => {
    expectCaptchaFailed(
      await login({ email: shop.owner.email, password: shop.owner.password, turnstile_token: DOWN }),
    )
  })

  it('still answers a wrong password with the same 401 once the token passes', async () => {
    const res = await login({ email: shop.owner.email, password: 'not-the-password', turnstile_token: GOOD })
    expect(res.statusCode).toBe(401)
  })
})

describe('login with Turnstile off', () => {
  it('ignores the token field', async () => {
    const t = await createTestApp()
    try {
      const shop = await signupShop(t.app, 'turnstile-off')
      expectStatus(
        await t.app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          headers: BROWSER,
          payload: { email: shop.owner.email, password: shop.owner.password },
        }),
        204,
      )
    } finally {
      await t.close()
    }
  })
})

describe('createTurnstileVerifier', () => {
  const reply =
    (status: number, body: unknown): typeof fetch =>
    async () =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('posts the secret, token and IP to siteverify', async () => {
    let sent: { url: string; body: unknown } | undefined
    const fetchFn: typeof fetch = async (url, init) => {
      sent = { url: url as string, body: JSON.parse(init?.body as string) }
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    expect(await createTurnstileVerifier('secret', fetchFn)('tok', '10.0.0.1')).toBe('ok')
    expect(sent).toEqual({
      url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      body: { secret: 'secret', response: 'tok', remoteip: '10.0.0.1' },
    })
  })

  it('maps Cloudflare replies to a result', async () => {
    const check = (fetchFn: typeof fetch) => createTurnstileVerifier('secret', fetchFn)('tok', '10.0.0.1')
    expect(await check(reply(200, { success: false, 'error-codes': ['invalid-input-response'] }))).toBe(
      'rejected',
    )
    expect(await check(reply(200, { success: 'true' }))).toBe('rejected')
    expect(await check(reply(500, {}))).toBe('unavailable')
    expect(
      await check(async () => {
        throw new TypeError('fetch failed')
      }),
    ).toBe('unavailable')
    expect(await check(async () => new Response('not json', { status: 200 }))).toBe('unavailable')
  })
})
