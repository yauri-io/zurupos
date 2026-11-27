// O3 (SPEC §12.7, PRD F19, D-083): the view beacon and the owner's counts.
// Bots aren't counted; the same IP + user agent counts once per 30 minutes;
// ?s=qr → qr; the business-day cutoff decides the date; unpublished never counts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLimiters } from '../../src/http/rate-limit.js'
import { recordView } from '../../src/modules/public-menu/service.js'
import { createViewWindow } from '../../src/modules/public-menu/view-window.js'
import { isBot } from '../../src/modules/public-menu/bots.js'
import { menuViewsInPeriod } from '../../src/scheduler/queries.js'
import { renderWeeklySummary } from '../../src/outbox/templates/weekly-summary.js'
import { withTenant } from '../../src/db/with-tenant.js'
import { createTestApp, expectStatus, type TestApp } from '../support/app.js'
import { api } from '../support/menu.js'
import { appPool, inTx } from '../support/pg.js'
import { roleShop, type RoleShop } from '../support/roles.js'

const PHONE = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile Safari/604.1'

let t: TestApp
const pool = appPool(2)
let shop: RoleShop
let slug = ''

type Row = { business_date: string; source: string; views: number }
const rows = (tenantId: string) =>
  inTx(
    pool,
    tenantId,
    async (c) =>
      (
        await c.query<Row>(
          `select business_date::text, source, views from menu_views_daily where tenant_id = $1 order by 1, 2`,
          [tenantId],
        )
      ).rows,
  )
const total = async (tenantId: string) => (await rows(tenantId)).reduce((n, r) => n + r.views, 0)

const beacon = (
  app: TestApp,
  s: string,
  opts: { body?: string; ua?: string; ip?: string; contentType?: string } = {},
) =>
  app.app.inject({
    method: 'POST',
    url: `/v1/public/menus/${s}/views`,
    remoteAddress: opts.ip ?? '10.1.0.1',
    // Exactly what navigator.sendBeacon sends for a string: no custom headers.
    headers: {
      'content-type': opts.contentType ?? 'text/plain;charset=UTF-8',
      origin: 'https://menu.zurupos.com',
      // inject would otherwise add its own user agent; '' means none at all.
      'user-agent': opts.ua ?? PHONE,
    },
    payload: opts.body ?? JSON.stringify({ source: 'link' }),
  })

const publishedShop = async (label: string) => {
  const s = await roleShop(t.app, label)
  const value = `pv-${label}-${Math.random().toString(36).slice(2, 8)}`
  await api(t.app, s.as.owner, 'PATCH', '/v1/online-menu', { slug: value })
  expectStatus(await api(t.app, s.as.owner, 'POST', '/v1/online-menu/publish'), 200)
  return { s, slug: value }
}

beforeAll(async () => {
  t = await createTestApp()
  ;({ s: shop, slug } = await publishedShop('views'))
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

describe('isBot', () => {
  it.each([
    'WhatsApp/2.23.20.0 A',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0)',
    'Twitterbot/1.0',
    'TelegramBot (like TwitterBot)',
    'Slackbot-LinkExpanding 1.0',
    'Mozilla/5.0 (compatible; Discordbot/2.0)',
    'Mozilla/5.0 (iPhone) Instagram 312.0.0.32.112',
    'SomeCrawler/1.0',
    'link-preview-service',
    '',
  ])('%s is a bot', (ua) => {
    expect(isBot(ua)).toBe(true)
  })
  it.each([PHONE, IPHONE])('a phone browser is not', (ua) => {
    expect(isBot(ua)).toBe(false)
  })
})

describe('POST /v1/public/menus/:slug/views', () => {
  it('counts a link view and a QR view, always 204, no CSRF header needed', async () => {
    const before = await total(shop.tenantId)
    expect((await beacon(t, slug, { ip: '10.2.0.1' })).statusCode).toBe(204)
    expect((await beacon(t, slug, { ip: '10.2.0.2', body: '{"source":"qr"}' })).statusCode).toBe(204)
    expect(await total(shop.tenantId)).toBe(before + 2)
    const sources = (await rows(shop.tenantId)).map((r) => r.source)
    expect(sources).toEqual(expect.arrayContaining(['qr', 'link']))
  })

  it('a JSON body works too; an unreadable source counts as a link view', async () => {
    const { s, slug: own } = await publishedShop('vjson')
    await beacon(t, own, { ip: '10.3.0.1', contentType: 'application/json', body: '{"source":"qr"}' })
    await beacon(t, own, { ip: '10.3.0.2', body: 'not json' })
    await beacon(t, own, { ip: '10.3.0.3', body: '{"source":"email"}' })
    const byKind = Object.fromEntries((await rows(s.tenantId)).map((r) => [r.source, r.views]))
    expect(byKind).toEqual({ qr: 1, link: 2 })
  })

  it('a bot user agent is not counted', async () => {
    const { s, slug: own } = await publishedShop('vbot')
    for (const ua of ['WhatsApp/2.23.20.0 A', 'facebookexternalhit/1.1', 'Googlebot/2.1', '']) {
      expect((await beacon(t, own, { ua, ip: '10.4.0.1' })).statusCode).toBe(204)
    }
    expect(await total(s.tenantId)).toBe(0)
  })

  it('the same IP + user agent twice in 30 minutes counts once; another phone counts', async () => {
    const { s, slug: own } = await publishedShop('vtwice')
    await beacon(t, own, { ip: '10.5.0.1' })
    await beacon(t, own, { ip: '10.5.0.1' })
    await beacon(t, own, { ip: '10.5.0.1', body: '{"source":"qr"}' })
    expect(await total(s.tenantId)).toBe(1)
    await beacon(t, own, { ip: '10.5.0.1', ua: IPHONE })
    await beacon(t, own, { ip: '10.5.0.9' })
    expect(await total(s.tenantId)).toBe(3)
  })

  it('an unpublished menu, an unknown or malformed slug never count', async () => {
    const s = await roleShop(t.app, 'vunpub')
    const own = `pv-unpub-${Math.random().toString(36).slice(2, 8)}`
    await api(t.app, s.as.owner, 'PATCH', '/v1/online-menu', { slug: own })
    for (const target of [own, 'pv-nope-000000', '-bad-', 'a'.repeat(64)]) {
      expect((await beacon(t, target, { ip: '10.6.0.1' })).statusCode, target).toBe(204)
    }
    expect(await total(s.tenantId)).toBe(0)
    // Published later: now it counts; unpublished again: it stops.
    await api(t.app, s.as.owner, 'POST', '/v1/online-menu/publish')
    await beacon(t, own, { ip: '10.6.0.2' })
    await api(t.app, s.as.owner, 'POST', '/v1/online-menu/unpublish')
    await beacon(t, own, { ip: '10.6.0.3' })
    expect(await total(s.tenantId)).toBe(1)
  })

  it('an old slug counts for the shop under its current slug', async () => {
    const { s, slug: own } = await publishedShop('vold')
    const next = `${own}-baru`
    await api(t.app, s.as.owner, 'PATCH', '/v1/online-menu', { slug: next })
    await beacon(t, own, { ip: '10.7.0.1' })
    // Same visitor on the new address within 30 minutes: still one view.
    await beacon(t, next, { ip: '10.7.0.1' })
    expect(await total(s.tenantId)).toBe(1)
  })

  it('30 per minute per IP; past that, still 204 but not counted', async () => {
    const limited = await createTestApp({ limiters: createLimiters(1) })
    try {
      const { s, slug: own } = await publishedShop('vlimit')
      for (let i = 0; i < 31; i++) {
        // A different user agent each time, so only the rate limit stops number 31.
        const res = await beacon(limited, own, { ip: '10.8.0.1', ua: `${PHONE} r${i}` })
        expect(res.statusCode).toBe(204)
      }
      expect(await total(s.tenantId)).toBe(30)
    } finally {
      await limited.close()
    }
  })

  it('a body over 1 KB is refused, never counted', async () => {
    const { s, slug: own } = await publishedShop('vbig')
    const res = await beacon(t, own, {
      ip: '10.9.0.1',
      body: JSON.stringify({ source: 'qr', pad: 'x'.repeat(2000) }),
    })
    expect(res.statusCode).not.toBe(500)
    expect(await total(s.tenantId)).toBe(0)
  })
})

describe('recordView (window and business date)', () => {
  it('counts the same visitor again after 30 minutes', async () => {
    const { s, slug: own } = await publishedShop('vwindow')
    const window = createViewWindow()
    const visit = (at: Date) =>
      recordView(t.db, window, { slug: own, source: 'link', ip: '1.1.1.1', userAgent: PHONE }, at)
    const start = new Date('2026-12-02T03:00:00Z')
    expect(await visit(start)).toBe(true)
    expect(await visit(new Date(start.getTime() + 29 * 60_000))).toBe(false)
    expect(await visit(new Date(start.getTime() + 30 * 60_000))).toBe(true)
    expect(await total(s.tenantId)).toBe(2)
  })

  it('a business-day cutoff of 2 puts a 01:30 view on the previous business date', async () => {
    const { s, slug: own } = await publishedShop('vcutoff')
    await api(t.app, s.as.owner, 'PATCH', '/v1/settings', { business_day_cutoff_hour: 2 })
    const window = createViewWindow()
    const visit = (iso: string, ip: string) =>
      recordView(t.db, window, { slug: own, source: 'qr', ip, userAgent: PHONE }, new Date(iso))
    // Jakarta is UTC+7: 01:30 WIB on 2 Dec = 18:30 UTC on 1 Dec; 02:30 WIB is past the cutoff.
    await visit('2026-12-01T18:30:00Z', '2.2.2.1')
    await visit('2026-12-01T19:30:00Z', '2.2.2.2')
    expect(await rows(s.tenantId)).toEqual([
      { business_date: '2026-12-01', source: 'qr', views: 1 },
      { business_date: '2026-12-02', source: 'qr', views: 1 },
    ])
  })

  it('the window is capped and keeps no IP as text', () => {
    const window = createViewWindow({ max: 3 })
    for (let i = 0; i < 10; i++) window.firstIn([`10.0.0.${i}`, 'ua', 'slug'], 1000 + i)
    expect(window.size()).toBe(3)
    // The oldest were dropped, so they count again.
    expect(window.firstIn(['10.0.0.0', 'ua', 'slug'], 2000)).toBe(true)
    expect(window.firstIn(['10.0.0.9', 'ua', 'slug'], 2000)).toBe(false)
  })
})

describe('GET /v1/online-menu/views', () => {
  type Views = {
    today: number
    last_7: number
    previous_7: number
    days: { business_date: string; qr: number; link: number }[]
  }

  it('today, the last 7 days against the 7 before, and the daily series with empty days as 0', async () => {
    const s = await roleShop(t.app, 'vread')
    const today = (await inTx(
      pool,
      s.tenantId,
      async (c) =>
        (await c.query<{ d: string }>(`select ((now() at time zone 'Asia/Jakarta'))::date::text as d`))
          .rows[0]?.d,
    )) as string
    const day = (offset: number) => {
      const d = new Date(`${today}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - offset)
      return d.toISOString().slice(0, 10)
    }
    await inTx(pool, s.tenantId, async (c) => {
      const put = (offset: number, source: string, views: number) =>
        c.query(
          `insert into menu_views_daily (tenant_id, business_date, source, views) values ($1, $2, $3, $4)`,
          [s.tenantId, day(offset), source, views],
        )
      await put(0, 'qr', 4)
      await put(0, 'link', 1)
      await put(6, 'link', 10)
      await put(7, 'qr', 7)
      await put(13, 'link', 2)
      await put(14, 'qr', 100)
      await put(40, 'qr', 1000)
    })
    const v = expectStatus(await api(t.app, s.as.owner, 'GET', '/v1/online-menu/views'), 200).json<Views>()
    expect({ today: v.today, last_7: v.last_7, previous_7: v.previous_7 }).toEqual({
      today: 5,
      last_7: 15,
      previous_7: 9,
    })
    expect(v.days).toHaveLength(30)
    expect(v.days.at(-1)).toEqual({ business_date: today, qr: 4, link: 1 })
    expect(v.days.at(-2)).toEqual({ business_date: day(1), qr: 0, link: 0 })
    expect(v.days[0]?.business_date).toBe(day(29))
    const week = expectStatus(
      await api(t.app, s.as.owner, 'GET', '/v1/online-menu/views?days=7'),
      200,
    ).json<Views>()
    expect(week.days).toHaveLength(7)
    expect(week.previous_7).toBe(9)
    const quarter = expectStatus(
      await api(t.app, s.as.owner, 'GET', '/v1/online-menu/views?days=90'),
      200,
    ).json<Views>()
    expect(quarter.days.reduce((n, d) => n + d.qr + d.link, 0)).toBe(1124)
  })

  it('only 7, 30 or 90 days; owner only', async () => {
    expect((await api(t.app, shop.as.owner, 'GET', '/v1/online-menu/views?days=14')).statusCode).toBe(400)
    for (const who of ['manager', 'cashier', 'employee'] as const) {
      expect((await api(t.app, shop.as[who], 'GET', '/v1/online-menu/views')).statusCode, who).toBe(403)
    }
  })
})

describe('weekly summary email line (F19)', () => {
  it('views of the week while published, nothing while unpublished', async () => {
    const { s, slug: own } = await publishedShop('vweekly')
    const window = createViewWindow()
    for (const [i, source] of ['qr', 'qr', 'link'].entries()) {
      await recordView(
        t.db,
        window,
        { slug: own, source, ip: `3.3.3.${i}`, userAgent: PHONE },
        new Date('2026-11-25T05:00:00Z'),
      )
    }
    const week = () =>
      withTenant(t.db, s.tenantId, (trx) => menuViewsInPeriod(trx, s.tenantId, '2026-11-23', '2026-11-29'))
    expect(await week()).toEqual({ qr: 2, link: 1 })
    await api(t.app, s.as.owner, 'POST', '/v1/online-menu/unpublish')
    expect(await week()).toBeNull()
    const shopWithout = await roleShop(t.app, 'vweekly-none')
    expect(
      await withTenant(t.db, shopWithout.tenantId, (trx) =>
        menuViewsInPeriod(trx, shopWithout.tenantId, '2026-11-23', '2026-11-29'),
      ),
    ).toBeNull()
  })

  it('the email shows the line only when there are view figures', () => {
    const base = {
      locale: 'id' as const,
      shopName: 'Kopi Demo',
      from: '2026-11-23',
      to: '2026-11-29',
      links: { home: 'h', heatmap: 'h', menu: 'm' },
      orders: 10n,
      netSales: 250000n,
      prevOrders: 0n,
      prevNetSales: 0n,
      changePct: null,
      busy: null,
      actions: [],
      incompleteCategories: [],
    }
    const withViews = renderWeeklySummary({ ...base, menuViews: { qr: 21, link: 16 } })
    expect(withViews.text).toContain('Menu online dibuka ±37 kali (21 lewat QR, 16 lewat link).')
    expect(withViews.html).toContain('Menu online dibuka ±37 kali')
    expect(renderWeeklySummary({ ...base, menuViews: null }).text).not.toContain('Menu online')
    expect(renderWeeklySummary({ ...base, locale: 'en', menuViews: { qr: 0, link: 2 } }).text).toContain(
      'Online menu opened about 2 times (0 by QR code, 2 by link).',
    )
  })
})
