// GET /v1/public/menus/:slug and GET /v1/online-menu/preview (SPEC §12.7,
// §3.6 #9, D-081): only a published shop's listed data, exactly the documented
// fields, read in a read-only transaction; moved, 404 and rate-limit rules.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { withTenant, withTenantReadOnly } from '../../src/db/with-tenant.js'
import { assertReadOnly } from '../../src/modules/public-menu/queries.js'
import { createLimiters } from '../../src/http/rate-limit.js'
import { createTestApp, expectStatus, type TestApp } from '../support/app.js'
import { solidImage } from '../support/images.js'
import { upload } from '../support/media.js'
import { api, createCategory, createItem } from '../support/menu.js'
import { appPool, inTx } from '../support/pg.js'
import { roleShop, type RoleShop } from '../support/roles.js'

let t: TestApp
const pool = appPool(2)
let a: RoleShop
let b: RoleShop
const slugOf = (label: string) => `pm-${label}-${Math.random().toString(36).slice(2, 8)}`
const slugs = { a: slugOf('a'), aOld: slugOf('aold'), b: slugOf('b') }

type Img = { url_small: string; url_large: string; width: number; height: number }
type Item = {
  id: string
  name: string
  price: number
  sold_out: boolean
  recommended: boolean
  photo: Img | null
}
type Menu = {
  kind: 'menu'
  shop: Record<string, unknown> & {
    price_note: unknown
    hours: unknown[]
    template: string
    accent_color: string
  }
  recommended: string[]
  categories: { id: string; name: string; items: Item[] }[]
  gallery: Img[]
  menu_version: string
}

const get = (slug: string) => t.app.inject({ method: 'GET', url: `/v1/public/menus/${slug}` })
const menuOf = async (slug: string) => expectStatus(await get(slug), 200).json<Menu>()

// A shop with every case the page must handle.
const buildMenu = async (s: RoleShop, slug: string, label: string) => {
  const o = s.as.owner
  const kopi = await createCategory(t.app, o, `${label} Kopi`, { sort: 1 })
  const makanan = await createCategory(t.app, o, `${label} Makanan`, { sort: 2 })
  const inactiveCat = await createCategory(t.app, o, `${label} Rahasia`, { sort: 3, is_active: false })
  const emptyCat = await createCategory(t.app, o, `${label} Kosong`, { sort: 0 })
  const hiddenOnlyCat = await createCategory(t.app, o, `${label} Tersembunyi`, { sort: 4 })
  const archivedCat = await createCategory(t.app, o, `${label} Lama`, { sort: 5 })
  const item = (cat: string, name: string, price: number, sort: number, extra = {}) =>
    createItem(t.app, o, cat, `${label} ${name}`, price, { sort, ...extra })
  const latte = await item(kopi.id, 'Latte', 28000, 2)
  const kopiSusu = await item(kopi.id, 'Kopi Susu', 25000, 1)
  const soldOut = await item(kopi.id, 'Mocha', 30000, 3, { is_available: false })
  const inactive = await item(kopi.id, 'Lama', 1000, 4, { is_active: false })
  const hidden = await item(kopi.id, 'Staf', 1000, 5)
  const archived = await item(kopi.id, 'Dihapus', 1000, 6)
  const croissant = await item(makanan.id, 'Croissant', 22000, 1)
  const inInactiveCat = await item(inactiveCat.id, 'Rahasia', 1000, 1)
  const onlyHidden = await item(hiddenOnlyCat.id, 'Tersembunyi', 1000, 1)
  const inArchivedCat = await item(archivedCat.id, 'Di Kategori Lama', 1000, 1)
  await api(t.app, o, 'PATCH', `/v1/items/${hidden.id}`, { show_online: false })
  await api(t.app, o, 'PATCH', `/v1/items/${onlyHidden.id}`, { show_online: false })
  await api(t.app, o, 'DELETE', `/v1/items/${archived.id}`)
  await api(t.app, o, 'DELETE', `/v1/items/${inArchivedCat.id}`)
  await api(t.app, o, 'DELETE', `/v1/categories/${archivedCat.id}`)
  for (const id of [croissant.id, latte.id, hidden.id]) {
    await api(t.app, o, 'PATCH', `/v1/items/${id}`, { is_recommended: true })
  }
  await upload(t.app, o, 'PUT', `/v1/items/${latte.id}/photo`, await solidImage(900, 600))
  await upload(t.app, o, 'POST', '/v1/online-menu/gallery', await solidImage(800, 800))
  await api(t.app, o, 'PATCH', '/v1/settings', {
    address: `${label} Jl. Braga 12`,
    tax_enabled: true,
    tax_bps: 1000,
  })
  await api(t.app, o, 'PATCH', '/v1/online-menu', {
    slug,
    description: `${label} kopi enak`,
    template: 'hangat',
    accent_color: '#c8873a',
    whatsapp: '6281234567890',
    instagram: 'kopi.test',
    maps_url: 'https://maps.app.goo.gl/x',
  })
  await api(t.app, o, 'PUT', '/v1/online-menu/hours', {
    hours: [
      { weekday: 1, opens: '07:00', closes: '22:00' },
      { weekday: 5, opens: '18:00', closes: '01:00' },
    ],
  })
  return {
    kopi,
    makanan,
    emptyCat,
    inactiveCat,
    hiddenOnlyCat,
    archivedCat,
    latte,
    kopiSusu,
    soldOut,
    inactive,
    hidden,
    archived,
    croissant,
    inInactiveCat,
    onlyHidden,
    inArchivedCat,
  }
}

let aMenu: Awaited<ReturnType<typeof buildMenu>>
let bMenu: Awaited<ReturnType<typeof buildMenu>>

beforeAll(async () => {
  t = await createTestApp()
  a = await roleShop(t.app, 'pm-a')
  b = await roleShop(t.app, 'pm-b')
  await api(t.app, a.as.owner, 'PATCH', '/v1/online-menu', { slug: slugs.aOld })
  aMenu = await buildMenu(a, slugs.a, 'ZZA')
  bMenu = await buildMenu(b, slugs.b, 'ZZB')
  for (const s of [a, b]) expectStatus(await api(t.app, s.as.owner, 'POST', '/v1/online-menu/publish'), 200)
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

describe('GET /v1/public/menus/:slug', () => {
  it('returns exactly the documented fields at every level', async () => {
    const m = await menuOf(slugs.a)
    expect(Object.keys(m).sort()).toEqual([
      'categories',
      'gallery',
      'kind',
      'menu_version',
      'recommended',
      'shop',
    ])
    expect(Object.keys(m.shop).sort()).toEqual(
      [
        'accent_color',
        'address',
        'cover',
        'description',
        'hours',
        'instagram',
        'logo',
        'maps_url',
        'name',
        'price_note',
        'template',
        'timezone',
        'whatsapp',
      ].sort(),
    )
    for (const c of m.categories) {
      expect(Object.keys(c).sort()).toEqual(['id', 'items', 'name'])
      for (const i of c.items) {
        expect(Object.keys(i).sort()).toEqual(['id', 'name', 'photo', 'price', 'recommended', 'sold_out'])
      }
    }
    for (const g of m.gallery)
      expect(Object.keys(g).sort()).toEqual(['height', 'url_large', 'url_small', 'width'])
  })

  it('shows the shop, hours, base prices, Habis and Rekomendasi in POS order', async () => {
    const m = await menuOf(slugs.a)
    expect(typeof m.shop['name']).toBe('string')
    expect(m.shop).toMatchObject({
      description: 'ZZA kopi enak',
      address: 'ZZA Jl. Braga 12',
      timezone: 'Asia/Jakarta',
      template: 'hangat',
      accent_color: '#c8873a',
      logo: null,
      cover: null,
      whatsapp: '6281234567890',
      instagram: 'kopi.test',
      maps_url: 'https://maps.app.goo.gl/x',
      hours: [
        { weekday: 1, opens: '07:00', closes: '22:00' },
        { weekday: 5, opens: '18:00', closes: '01:00' },
      ],
      price_note: { tax_name: 'PB1', service_charge: false },
    })
    expect(m.categories.map((c) => c.name)).toEqual(['ZZA Kopi', 'ZZA Makanan'])
    const kopi = m.categories[0]?.items ?? []
    expect(kopi.map((i) => [i.name, i.price, i.sold_out, i.recommended])).toEqual([
      ['ZZA Kopi Susu', 25000, false, false],
      ['ZZA Latte', 28000, false, true],
      ['ZZA Mocha', 30000, true, false],
    ])
    expect(kopi[1]?.photo?.url_large).toMatch(/-1200\.webp$/)
    expect(kopi[0]?.photo).toBeNull()
    // Category order, then item order; the hidden recommended item is left out.
    expect(m.recommended).toEqual([aMenu.latte.id, aMenu.croissant.id])
    expect(m.gallery).toHaveLength(1)
  })

  it('hidden, inactive and archived items and categories, and empty categories, never appear', async () => {
    const body = (await get(slugs.a)).body
    for (const hidden of [
      aMenu.inactive,
      aMenu.hidden,
      aMenu.archived,
      aMenu.inInactiveCat,
      aMenu.onlyHidden,
      aMenu.inArchivedCat,
      aMenu.emptyCat,
      aMenu.inactiveCat,
      aMenu.hiddenOnlyCat,
      aMenu.archivedCat,
    ]) {
      expect(body).not.toContain(hidden.id)
    }
    for (const word of ['Rahasia', 'Kosong', 'Tersembunyi', 'Dihapus', 'Staf', 'Lama']) {
      expect(body).not.toContain(word)
    }
  })

  it("A's slug never returns any of B's rows", async () => {
    const body = (await get(slugs.a)).body
    expect(body).not.toContain('ZZB')
    expect(body).not.toContain(b.tenantId)
    for (const row of Object.values(bMenu)) expect(body).not.toContain(row.id)
    expect(body).not.toContain(a.tenantId)
  })

  it('no costs, recipes, stock, modifiers or staff fields anywhere', async () => {
    const body = (await get(slugs.a)).body
    for (const word of [
      'cost',
      'stock',
      'recipe',
      'modifier',
      'pin',
      'email',
      'tenant',
      'user',
      'is_active',
      'show_online',
    ]) {
      expect(body.toLowerCase()).not.toContain(`"${word}`)
    }
  })

  it('an old slug, or another letter case, answers moved with the current slug', async () => {
    expect(expectStatus(await get(slugs.aOld), 200).json()).toEqual({ kind: 'moved', slug: slugs.a })
    expect(expectStatus(await get(slugs.a.toUpperCase()), 200).json()).toEqual({
      kind: 'moved',
      slug: slugs.a,
    })
  })

  it('unknown, malformed and unpublished slugs, and a shop without an active owner, are 404', async () => {
    for (const slug of ['pm-nope-000000', 'ab', '-bad-', 'a'.repeat(64), '..%2F..', 'kopi%20demo']) {
      const res = await get(slug)
      expect(res.statusCode, slug).toBe(404)
      expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
    }
    const c = await roleShop(t.app, 'pm-c')
    const slug = slugOf('c')
    await api(t.app, c.as.owner, 'PATCH', '/v1/online-menu', { slug })
    expect((await get(slug)).statusCode).toBe(404)
    await api(t.app, c.as.owner, 'POST', '/v1/online-menu/publish')
    expect((await get(slug)).statusCode).toBe(200)
    await api(t.app, c.as.owner, 'POST', '/v1/online-menu/unpublish')
    expect((await get(slug)).statusCode).toBe(404)
    await api(t.app, c.as.owner, 'POST', '/v1/online-menu/publish')
    await inTx(pool, c.tenantId, (cl) => cl.query(`update users set is_active = false where role = 'owner'`))
    expect((await get(slug)).statusCode).toBe(404)
  })

  it('price_note is null without tax or service charge, and names only what applies', async () => {
    await api(t.app, b.as.owner, 'PATCH', '/v1/settings', {
      tax_enabled: false,
      service_charge_enabled: false,
    })
    expect((await menuOf(slugs.b)).shop.price_note).toBeNull()
    await api(t.app, b.as.owner, 'PATCH', '/v1/settings', {
      service_charge_enabled: true,
      service_charge_bps: 500,
    })
    expect((await menuOf(slugs.b)).shop.price_note).toEqual({ tax_name: null, service_charge: true })
  })

  it('menu_version changes with what the page shows, e.g. a sold-out tap', async () => {
    const before = (await menuOf(slugs.a)).menu_version
    expect((await menuOf(slugs.a)).menu_version).toBe(before)
    await api(t.app, a.as.cashier, 'PATCH', `/v1/items/${aMenu.kopiSusu.id}/availability`, {
      is_available: false,
    })
    const after = await menuOf(slugs.a)
    expect(after.menu_version).not.toBe(before)
    expect(after.categories[0]?.items[0]).toMatchObject({ id: aMenu.kopiSusu.id, sold_out: true })
    await api(t.app, a.as.cashier, 'PATCH', `/v1/items/${aMenu.kopiSusu.id}/availability`, {
      is_available: true,
    })
  })

  it('needs no credentials and sends no-store', async () => {
    const res = await get(slugs.a)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['set-cookie']).toBeUndefined()
  })
})

describe('read-only transaction (D-081)', () => {
  it('withTenantReadOnly refuses writes, and the public reads refuse a writable transaction', async () => {
    const write = withTenantReadOnly(t.db, a.tenantId, (trx) =>
      sql`update menu_profiles set description = 'x' where tenant_id = ${a.tenantId}`.execute(trx),
    )
    await expect(write).rejects.toMatchObject({ code: '25006' })
    await expect(withTenantReadOnly(t.db, a.tenantId, (trx) => assertReadOnly(trx))).resolves.toBeUndefined()
    await expect(withTenant(t.db, a.tenantId, (trx) => assertReadOnly(trx))).rejects.toThrow(/not read only/)
  })
})

describe('rate limit (120/min per IP)', () => {
  it('the 121st request in a minute is 429', async () => {
    const limited = await createTestApp({ limiters: createLimiters(1) })
    try {
      const hit = (ip: string) =>
        limited.app.inject({ method: 'GET', url: `/v1/public/menus/${slugs.a}`, remoteAddress: ip })
      for (let i = 0; i < 120; i++) expect((await hit('10.0.0.1')).statusCode).toBe(200)
      expect((await hit('10.0.0.1')).statusCode).toBe(429)
      expect((await hit('10.0.0.2')).statusCode).toBe(200)
    } finally {
      await limited.close()
    }
  })
})

describe('GET /v1/online-menu/preview', () => {
  it('shows the owner the page payload even unpublished, with unsaved look choices', async () => {
    await api(t.app, b.as.owner, 'POST', '/v1/online-menu/unpublish')
    expect((await get(slugs.b)).statusCode).toBe(404)
    const preview = expectStatus(
      await api(t.app, b.as.owner, 'GET', '/v1/online-menu/preview'),
      200,
    ).json<Menu>()
    expect(preview.kind).toBe('menu')
    expect(preview.categories.map((c) => c.name)).toEqual(['ZZB Kopi', 'ZZB Makanan'])
    expect(preview.shop.template).toBe('hangat')
    const look = expectStatus(
      await api(t.app, b.as.owner, 'GET', '/v1/online-menu/preview?template=foto&accent_color=%23FF0000'),
      200,
    ).json<Menu>()
    expect(look.shop).toMatchObject({ template: 'foto', accent_color: '#ff0000' })
    // Nothing was saved.
    expect(
      expectStatus(await api(t.app, b.as.owner, 'GET', '/v1/online-menu'), 200).json<{ template: string }>()
        .template,
    ).toBe('hangat')
  })

  it('rejects bad look values and is owner only', async () => {
    expect((await api(t.app, b.as.owner, 'GET', '/v1/online-menu/preview?template=neon')).statusCode).toBe(
      400,
    )
    expect((await api(t.app, b.as.owner, 'GET', '/v1/online-menu/preview?accent_color=red')).statusCode).toBe(
      400,
    )
    for (const who of ['manager', 'cashier', 'employee'] as const) {
      expect((await api(t.app, b.as[who], 'GET', '/v1/online-menu/preview')).statusCode, who).toBe(403)
    }
  })
})
