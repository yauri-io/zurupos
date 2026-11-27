// Online menu profile, slug, hours and publish (SPEC §12.7, PRD F18, D-080).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, expectStatus, type TestApp } from '../support/app.js'
import { api } from '../support/menu.js'
import { appPool, inTx } from '../support/pg.js'
import { auditActions, roleShop, type RoleShop } from '../support/roles.js'

let t: TestApp
let shop: RoleShop
let other: RoleShop
const pool = appPool(1)

beforeAll(async () => {
  t = await createTestApp()
  shop = await roleShop(t.app, 'omprofile')
  other = await roleShop(t.app, 'omother')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

type Menu = {
  name: string
  is_published: boolean
  published_at: string | null
  slug: string | null
  public_url: string | null
  qr_url: string | null
  description: string | null
  template: string
  accent_color: string
  whatsapp: string | null
  instagram: string | null
  maps_url: string | null
  hours: { weekday: number; opens: string; closes: string }[]
  recommended_count: number
}

const get = async (s: RoleShop = shop) =>
  expectStatus(await api(t.app, s.as.owner, 'GET', '/v1/online-menu'), 200).json<Menu>()
const patch = (body: unknown, s: RoleShop = shop) => api(t.app, s.as.owner, 'PATCH', '/v1/online-menu', body)
const unique = () => `kopi-${Math.random().toString(36).slice(2, 10)}`

describe('GET /online-menu', () => {
  it('a new shop has an unpublished menu with the defaults and no slug', async () => {
    const fresh = await roleShop(t.app, 'omfresh')
    expect(await get(fresh)).toMatchObject({
      is_published: false,
      published_at: null,
      slug: null,
      public_url: null,
      qr_url: null,
      template: 'papan',
      accent_color: '#6b4f3a',
      hours: [],
      recommended_count: 0,
      logo: null,
      cover: null,
      gallery: [],
      limits: { recommended: 5, gallery: 6, description: 160 },
    })
  })
})

describe('PATCH /online-menu: profile fields', () => {
  it('saves any subset, normalises, and null clears', async () => {
    const saved = expectStatus(
      await patch({
        description: '  Kopi susu gula aren sejak 2019.  ',
        template: 'hangat',
        accent_color: '#C8873A',
        whatsapp: '6281234567890',
        instagram: 'kopi.demo_',
        maps_url: 'https://maps.app.goo.gl/abc123',
      }),
      200,
    ).json<Menu>()
    expect(saved).toMatchObject({
      description: 'Kopi susu gula aren sejak 2019.',
      template: 'hangat',
      accent_color: '#c8873a',
      whatsapp: '6281234567890',
      instagram: 'kopi.demo_',
      maps_url: 'https://maps.app.goo.gl/abc123',
    })
    const cleared = expectStatus(await patch({ whatsapp: null, description: '   ' }), 200).json<Menu>()
    expect(cleared).toMatchObject({ whatsapp: null, description: null, template: 'hangat' })
  })

  it.each([
    [{ description: 'x'.repeat(161) }],
    [{ template: 'neon' }],
    [{ accent_color: 'red' }],
    [{ accent_color: '#12345' }],
    [{ whatsapp: '081234567890' }],
    [{ whatsapp: '62123' }],
    [{ whatsapp: '62 812 3456 7890' }],
    [{ instagram: '@kopi' }],
    [{ instagram: 'Kopi' }],
    [{ unknown: true }],
  ])('rejects %o', async (body) => {
    expect((await patch(body)).statusCode).toBe(400)
  })

  it('accepts exactly 160 characters', async () => {
    expect((await patch({ description: 'é'.repeat(160) })).statusCode).toBe(200)
  })

  it.each([
    'https://www.google.com/maps/place/Kopi/@-6.2,106.8,17z',
    'https://google.com/maps?q=-6.2,106.8',
    'https://maps.google.com/?q=kopi',
    'https://maps.app.goo.gl/xyz',
    'https://goo.gl/maps/xyz',
  ])('accepts the maps link %s', async (url) => {
    expect((await patch({ maps_url: url })).statusCode).toBe(200)
  })

  it.each([
    'http://maps.app.goo.gl/xyz',
    'https://evil.example/maps',
    'https://google.com/search?q=kopi',
    'https://goo.gl/xyz',
    'https://maps.app.goo.gl.evil.example/x',
    'https://user:pw@maps.google.com/',
    'https://maps.google.com:8443/',
    'javascript:alert(1)',
    'not a url',
  ])('rejects the maps link %s', async (url) => {
    const res = await patch({ maps_url: url })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION', details: { field: 'maps_url' } } })
  })

  it('profile changes are in the audit log', async () => {
    await patch({ template: 'foto' })
    const rows = await auditActions(pool, shop.tenantId)
    expect(rows.filter((r) => r.action === 'settings.change').map((r) => r.data)).toContainEqual({
      online_menu: { template: 'foto' },
    })
  })
})

describe('PATCH /online-menu: slug (D-080)', () => {
  it.each(['ab', 'a'.repeat(41), '-kopi', 'kopi-', 'ko--pi', 'Kopi', 'kopi_senja', 'kopi senja', 'kopí'])(
    'rejects the malformed slug %s',
    async (slug) => {
      expect((await patch({ slug })).statusCode).toBe(400)
    },
  )

  it.each(['admin', 'api', 'menu', 'www', 'zurupos', 'login', 'media', 'static', 'help'])(
    'rejects the reserved slug %s',
    async (slug) => {
      const res = await patch({ slug })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toMatchObject({ error: { details: { reason: 'slug_reserved' } } })
    },
  )

  it('a slug cannot be cleared', async () => {
    expect((await patch({ slug: null })).statusCode).toBe(400)
  })

  it('sets the slug and the public and QR links', async () => {
    const slug = unique()
    const menu = expectStatus(await patch({ slug }), 200).json<Menu>()
    expect(menu).toMatchObject({
      slug,
      public_url: `http://localhost:3001/${slug}`,
      qr_url: `http://localhost:3001/${slug}?s=qr`,
    })
  })

  it('accepts 3 and 40 characters', async () => {
    for (const slug of [`k${Math.random().toString(36).slice(2, 4)}`, unique().padEnd(40, 'x')]) {
      expect((await patch({ slug })).statusCode, slug).toBe(200)
    }
  })

  it('changing keeps the old slug for this shop; reusing it makes it current again', async () => {
    const first = unique()
    const second = unique()
    await patch({ slug: first })
    await patch({ slug: second })
    // zuru_app sees slugs only inside the shop's own tenant context.
    const rows = () =>
      inTx(pool, shop.tenantId, async (c) => {
        const { rows: found } = await c.query<{ slug: string; is_current: boolean }>(
          `select slug::text, is_current from menu_slugs where slug in ($1, $2) order by slug`,
          [first, second],
        )
        return found
      })
    expect(await rows()).toEqual(
      [
        { slug: first, is_current: false },
        { slug: second, is_current: true },
      ].sort((x, y) => x.slug.localeCompare(y.slug)),
    )
    const back = expectStatus(await patch({ slug: first }), 200).json<Menu>()
    expect(back.slug).toBe(first)
    expect(await rows()).toEqual(
      [
        { slug: first, is_current: true },
        { slug: second, is_current: false },
      ].sort((x, y) => x.slug.localeCompare(y.slug)),
    )
    const audit = (await auditActions(pool, shop.tenantId)).filter((r) => r.action === 'online_menu.slug')
    expect(audit.map((r) => r.data).slice(-2)).toEqual([
      { from: first, to: second },
      { from: second, to: first },
    ])
  })

  it("another shop's slug (current or old) is 409 slug_taken and nothing changes", async () => {
    const theirs = unique()
    const theirsOld = unique()
    await patch({ slug: theirsOld }, other)
    await patch({ slug: theirs }, other)
    const mine = unique()
    await patch({ slug: mine })
    for (const slug of [theirs, theirsOld]) {
      const res = await patch({ slug, description: 'should not be saved' })
      expect(res.statusCode, slug).toBe(409)
      expect(res.json()).toMatchObject({ error: { code: 'CONFLICT', details: { reason: 'slug_taken' } } })
      // Nothing about the other shop is in the answer.
      expect(res.body).not.toContain(other.tenantId)
    }
    const after = await get()
    expect(after.slug).toBe(mine)
    expect(after.description).not.toBe('should not be saved')
    expect((await get(other)).slug).toBe(theirs)
  })

  it('setting the same slug again is a no-op', async () => {
    const slug = unique()
    await patch({ slug })
    const before = (await auditActions(pool, shop.tenantId)).length
    expect((await patch({ slug })).statusCode).toBe(200)
    expect((await auditActions(pool, shop.tenantId)).length).toBe(before)
  })
})

describe('PUT /online-menu/hours', () => {
  const put = (hours: unknown) => api(t.app, shop.as.owner, 'PUT', '/v1/online-menu/hours', { hours })

  it('replaces the week, sorted by weekday, past midnight allowed', async () => {
    const menu = expectStatus(
      await put([
        { weekday: 7, opens: '08:00', closes: '20:00' },
        { weekday: 1, opens: '07:00', closes: '22:00' },
        { weekday: 5, opens: '18:00', closes: '01:00' },
      ]),
      200,
    ).json<Menu>()
    expect(menu.hours).toEqual([
      { weekday: 1, opens: '07:00', closes: '22:00' },
      { weekday: 5, opens: '18:00', closes: '01:00' },
      { weekday: 7, opens: '08:00', closes: '20:00' },
    ])
    const again = expectStatus(await put([{ weekday: 2, opens: '09:00', closes: '17:30' }]), 200).json<Menu>()
    expect(again.hours).toEqual([{ weekday: 2, opens: '09:00', closes: '17:30' }])
    expect(expectStatus(await put([]), 200).json<Menu>().hours).toEqual([])
  })

  it.each([
    [[{ weekday: 1, opens: '07:00', closes: '07:00' }], 'opens_equals_closes'],
    [
      [
        { weekday: 1, opens: '07:00', closes: '22:00' },
        { weekday: 1, opens: '08:00', closes: '12:00' },
      ],
      'duplicate_weekday',
    ],
  ])('rejects %o', async (hours, reason) => {
    const res = await put(hours)
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: { details: { reason } } })
  })

  it.each([
    [[{ weekday: 0, opens: '07:00', closes: '22:00' }]],
    [[{ weekday: 8, opens: '07:00', closes: '22:00' }]],
    [[{ weekday: 1, opens: '24:00', closes: '22:00' }]],
    [[{ weekday: 1, opens: '7:00', closes: '22:00' }]],
    [[{ weekday: 1, opens: '07:00:00', closes: '22:00' }]],
  ])('rejects malformed %o', async (hours) => {
    expect((await put(hours)).statusCode).toBe(400)
  })
})

describe('publish / unpublish', () => {
  it('publishing needs a slug', async () => {
    const fresh = await roleShop(t.app, 'omnoslug')
    const res = await api(t.app, fresh.as.owner, 'POST', '/v1/online-menu/publish')
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ error: { details: { reason: 'slug_required' } } })
    expect((await get(fresh)).is_published).toBe(false)
  })

  it('publishes and unpublishes, each once in the audit log', async () => {
    await patch({ slug: unique() })
    const on = expectStatus(
      await api(t.app, shop.as.owner, 'POST', '/v1/online-menu/publish'),
      200,
    ).json<Menu>()
    expect(on.is_published).toBe(true)
    expect(on.published_at).not.toBeNull()
    // Again: still published, no second entry.
    expectStatus(await api(t.app, shop.as.owner, 'POST', '/v1/online-menu/publish'), 200)
    const off = expectStatus(
      await api(t.app, shop.as.owner, 'POST', '/v1/online-menu/unpublish'),
      200,
    ).json<Menu>()
    expect(off).toMatchObject({ is_published: false, published_at: null })
    expectStatus(await api(t.app, shop.as.owner, 'POST', '/v1/online-menu/unpublish'), 200)
    const actions = (await auditActions(pool, shop.tenantId)).map((r) => r.action)
    expect(actions.filter((a) => a === 'online_menu.publish')).toHaveLength(1)
    expect(actions.filter((a) => a === 'online_menu.unpublish')).toHaveLength(1)
  })
})

describe('permissions (PRD §6)', () => {
  const PROFILE_ROUTES: [method: 'GET' | 'PATCH' | 'PUT' | 'POST' | 'DELETE', url: string, body?: unknown][] =
    [
      ['GET', '/v1/online-menu'],
      ['PATCH', '/v1/online-menu', { template: 'foto' }],
      ['PUT', '/v1/online-menu/hours', { hours: [] }],
      ['POST', '/v1/online-menu/publish'],
      ['POST', '/v1/online-menu/unpublish'],
      ['PUT', '/v1/online-menu/logo'],
      ['DELETE', '/v1/online-menu/logo'],
      ['PUT', '/v1/online-menu/cover'],
      ['DELETE', '/v1/online-menu/cover'],
      ['POST', '/v1/online-menu/gallery'],
      ['DELETE', '/v1/online-menu/gallery/00000000-0000-4000-8000-000000000000'],
    ]

  it.each(PROFILE_ROUTES)('%s %s: manager, cashier and employee get 403', async (method, url, body) => {
    for (const who of ['manager', 'cashier', 'employee'] as const) {
      const res = await api(t.app, shop.as[who], method, url, body)
      expect(res.statusCode, who).toBe(403)
    }
  })

  it('the owner can also use them from a paired device', async () => {
    expect((await api(t.app, shop.as.ownerStaff, 'GET', '/v1/online-menu')).statusCode).toBe(200)
  })
})
