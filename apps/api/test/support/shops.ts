import type pg from 'pg'
import type { App } from '../../src/http/types.js'
import {
  createUser,
  headersFor,
  pairDevice,
  signupShop,
  staffLogin,
  type Creds,
  type Shop,
  type StaffUser,
} from './app.js'
import { seedRowsForTenant, type SeededTenant } from './seed.js'

export type FullShop = Shop & {
  cashier: StaffUser
  deviceToken: string
  deviceId: string
  dashboard: Creds
  staff: Creds
  device: Creds
  seeded: SeededTenant
  // Every id and marker belonging to this shop, for leak scans.
  secrets: string[]
}

// A shop with API-created users and a device, plus one DB row in every tenant table.
export const buildFullShop = async (app: App, pool: pg.Pool, label: string): Promise<FullShop> => {
  const shop = await signupShop(app, label)
  const cashier = await createUser(app, shop.ownerCookie, {
    name: `${shop.marker} kasir`,
    role: 'cashier',
    pin: '4826',
  })
  const paired = await pairDevice(app, shop.owner.email, shop.owner.password)
  const staffToken = await staffLogin(app, paired.device_token, shop.owner.id, shop.owner.pin)
  const seeded = await seedRowsForTenant(pool, shop.tenantId, shop.marker)
  const seededIds = Object.entries(seeded)
    .filter(([key]) => key !== 'marker')
    .map(([, value]) => value)
  return {
    ...shop,
    cashier,
    deviceToken: paired.device_token,
    deviceId: paired.device.id,
    dashboard: { kind: 'dashboard', cookie: shop.ownerCookie },
    staff: { kind: 'staff', deviceToken: paired.device_token, staffToken },
    device: { kind: 'device', deviceToken: paired.device_token },
    seeded,
    secrets: [
      shop.marker,
      shop.tenantId,
      shop.owner.id,
      shop.owner.email,
      cashier.id,
      paired.device.id,
      ...seededIds,
    ],
  }
}

export const leakedSecrets = (body: string, other: FullShop): string[] =>
  other.secrets.filter((s) => body.includes(s))

// Gives the shop a unique slug and publishes its online menu (O2); returns the slug.
export const publishMenu = async (app: App, shop: FullShop): Promise<string> => {
  const slug = `pub-${shop.label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${shop.tenantId.slice(0, 8)}`
  const headers = { 'x-requested-with': 'zuru', ...headersFor(shop.dashboard) }
  const set = await app.inject({ method: 'PATCH', url: '/v1/online-menu', headers, payload: { slug } })
  if (set.statusCode !== 200) throw new Error(`slug: ${set.statusCode} ${set.body}`)
  const pub = await app.inject({ method: 'POST', url: '/v1/online-menu/publish', headers })
  if (pub.statusCode !== 200) throw new Error(`publish: ${pub.statusCode} ${pub.body}`)
  return slug
}
