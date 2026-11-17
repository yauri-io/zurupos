import { randomUUID } from 'node:crypto'
import type { LightMyRequestResponse } from 'fastify'
import { buildApp } from '../../src/app.js'
import { createDb, type Database } from '../../src/db/kysely.js'
import { createLimiters, type Limiters } from '../../src/http/rate-limit.js'
import type { App } from '../../src/http/types.js'
import { testConfig } from '../helpers.js'
import { workerPool } from './pg.js'

export type TestApp = { app: App; db: Database; close: () => Promise<void> }

export const createTestApp = async (
  opts: { poolMax?: number; limiters?: Limiters; signupEnabled?: boolean } = {},
): Promise<TestApp> => {
  const config = testConfig(opts.signupEnabled === undefined ? {} : { signupEnabled: opts.signupEnabled })
  const db = createDb(config.databaseUrl, opts.poolMax ?? 4)
  const app = await buildApp({ config, db, limiters: opts.limiters ?? createLimiters(1000) })
  await app.ready()
  return {
    app,
    db,
    close: async () => {
      await app.close()
      await db.destroy()
    },
  }
}

export const BROWSER = { 'x-requested-with': 'zuru', origin: 'http://localhost:3000' }
// The cashier app sends the CSRF header on every request and no Origin (D-026).
export const APP_HEADERS = { 'x-requested-with': 'zuru' }

export type Creds =
  | { kind: 'dashboard'; cookie: string }
  | { kind: 'device'; deviceToken: string }
  | { kind: 'staff'; deviceToken: string; staffToken: string }

export const headersFor = (creds: Creds): Record<string, string> => {
  if (creds.kind === 'dashboard') return { ...BROWSER, cookie: `zuru_session=${creds.cookie}` }
  if (creds.kind === 'device') return { 'x-device-token': creds.deviceToken }
  return { 'x-device-token': creds.deviceToken, authorization: `Bearer ${creds.staffToken}` }
}

export const sessionCookie = (res: LightMyRequestResponse): string => {
  const cookie = res.cookies.find((c) => c.name === 'zuru_session')
  if (!cookie) throw new Error(`no session cookie (status ${res.statusCode}: ${res.body})`)
  return cookie.value
}

export const expectStatus = (res: LightMyRequestResponse, status: number) => {
  if (res.statusCode !== status) {
    throw new Error(`expected ${status}, got ${res.statusCode}: ${res.body}`)
  }
  return res
}

export const uniqueEmail = (label: string) =>
  `${label.toLowerCase()}-${randomUUID().slice(0, 12)}@test.zurupos.local`

export type StaffUser = {
  id: string
  name: string
  role: string
  pin: string
  email?: string
  password?: string
}

export type Shop = {
  label: string
  marker: string
  tenantId: string
  owner: StaffUser & { email: string; password: string }
  ownerCookie: string
}

export const signupShop = async (app: App, label: string): Promise<Shop> => {
  const marker = `ZZMARK-${label}-${randomUUID().slice(0, 8)}`
  const owner = {
    name: `${marker} owner`,
    email: uniqueEmail(label),
    password: 'kopi-susu-aren-2026',
    pin: '2580',
  }
  const res = expectStatus(
    await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      headers: BROWSER,
      payload: { shop_name: `${marker} shop`, ...owner },
    }),
    201,
  )
  const cookie = sessionCookie(res)
  const me = expectStatus(
    await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: headersFor({ kind: 'dashboard', cookie }),
    }),
    200,
  ).json<{ user: { id: string }; tenant: { id: string } }>()
  return {
    label,
    marker,
    tenantId: me.tenant.id,
    owner: { ...owner, id: me.user.id, role: 'owner' },
    ownerCookie: cookie,
  }
}

export const createUser = async (
  app: App,
  ownerCookie: string,
  input: { name: string; role: 'manager' | 'cashier' | 'employee'; pin: string; email?: string },
): Promise<StaffUser> => {
  const res = expectStatus(
    await app.inject({
      method: 'POST',
      url: '/v1/users',
      headers: headersFor({ kind: 'dashboard', cookie: ownerCookie }),
      payload: input,
    }),
    201,
  )
  return { ...input, id: res.json<{ id: string }>().id }
}

export const pairDevice = async (app: App, email: string, password: string, name = 'Kasir 1') => {
  const res = expectStatus(
    await app.inject({
      method: 'POST',
      url: '/v1/devices/pair',
      headers: APP_HEADERS,
      payload: { email, password, device_name: name },
    }),
    201,
  )
  return res.json<{ device_token: string; device: { id: string; name: string } }>()
}

export const pinLogin = async (app: App, deviceToken: string, userId: string, pin: string) =>
  app.inject({
    method: 'POST',
    url: '/v1/device/sessions',
    headers: { 'x-device-token': deviceToken },
    payload: { user_id: userId, pin },
  })

export const staffLogin = async (
  app: App,
  deviceToken: string,
  userId: string,
  pin: string,
): Promise<string> =>
  expectStatus(await pinLogin(app, deviceToken, userId, pin), 201).json<{ staff_token: string }>().staff_token

// zuru_app cannot read the outbox (INSERT only), so tests read it as the worker role.
export const latestEmailTo = async (address: string) => {
  const pool = workerPool(1)
  try {
    const { rows } = await pool.query<{ kind: string; subject: string; text: string; html: string }>(
      `select kind, subject, text, html from outbox where $1 = any (to_addresses) order by created_at desc limit 1`,
      [address.toLowerCase()],
    )
    return rows[0]
  } finally {
    await pool.end()
  }
}

export const tokenFromEmail = (text: string): string => {
  const match = /(?:token=|\/invite\/)([A-Za-z0-9_-]{43})/.exec(text)
  if (!match?.[1]) throw new Error(`no token in email: ${text}`)
  return match[1]
}

// Accepts a manager invite so the manager has a dashboard password.
export const createManager = async (app: App, shop: Shop, pin = '3691'): Promise<StaffUser> => {
  const email = uniqueEmail(`${shop.label}-mgr`)
  const manager = await createUser(app, shop.ownerCookie, {
    name: `${shop.marker} manager`,
    role: 'manager',
    pin,
    email,
  })
  const mail = await latestEmailTo(email)
  if (!mail) throw new Error('invite email not enqueued')
  const password = 'manajer-kopi-2026'
  expectStatus(
    await app.inject({
      method: 'POST',
      url: '/v1/auth/invite/accept',
      headers: BROWSER,
      payload: { token: tokenFromEmail(mail.text), password },
    }),
    204,
  )
  return { ...manager, email, password }
}

export const dashboardLogin = async (app: App, email: string, password: string) =>
  sessionCookie(
    expectStatus(
      await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        headers: BROWSER,
        payload: { email, password },
      }),
      204,
    ),
  )
