// O2 exit (SPEC §16): publish in the dashboard → the public page at
// localhost:3001 shows the right items, prices, Habis, Rekomendasi and today's
// hours, for each template with no photos and with all photos, at 360 px and
// desktop; head tags and JSON-LD; old slug → 308 keeping ?s=qr; unpublishing →
// 404 within 15 s; page budget; the dashboard's live preview.
import { randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'

const API = process.env.API_URL ?? 'http://localhost:4000'
const MENU = process.env.MENU_URL ?? 'http://localhost:3001'
const ORIGIN = process.env.DASHBOARD_URL ?? 'http://localhost:3000'
const headers = { 'x-requested-with': 'zuru', origin: ORIGIN }
const TEMPLATES = ['papan', 'foto', 'hangat'] as const
// Headless Chrome is on the bot list (D-083), so visitors use phone user agents.
const PHONE_1 =
  'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'
const PHONE_2 =
  'Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'
const isBeacon = (url: string) => /\/v1\/public\/menus\/[^/]+\/views$/.test(url)
// The menu app keeps each slug's payload for 15 s (§12.7); changes show within that.
const CACHE_WAIT = { timeout: 25_000, intervals: [1000] }

const owner = {
  shop_name: `Kopi Publik ${randomUUID().slice(0, 4)}`,
  name: 'Rani',
  email: `e2e-${randomUUID().slice(0, 8)}@test.zurupos.local`,
  password: 'kopi-susu-aren-2026',
  pin: '2580',
}
const jakartaWeekday = () => {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' }).format(
    new Date(),
  )
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(short) + 1
}

const api = async (page: Page, method: 'POST' | 'PATCH' | 'PUT', path: string, data?: object) => {
  const res = await page.request.fetch(`${API}/v1${path}`, { method, headers, ...(data ? { data } : {}) })
  expect(res.status(), `${method} ${path}: ${await res.text()}`).toBeLessThan(300)
  return (await res.json()) as { id: string }
}

const photo = async (page: Page, hue: number): Promise<Buffer> =>
  Buffer.from(
    await page.evaluate((h) => {
      const c = document.createElement('canvas')
      c.width = 1200
      c.height = 900
      const ctx = c.getContext('2d')
      if (!ctx) throw new Error('no canvas')
      ctx.fillStyle = `hsl(${h} 45% 35%)`
      ctx.fillRect(0, 0, 1200, 900)
      ctx.fillStyle = '#f5e6d3'
      ctx.beginPath()
      ctx.arc(600, 470, 220, 0, Math.PI * 2)
      ctx.fill()
      return c.toDataURL('image/jpeg', 0.85).split(',')[1] ?? ''
    }, hue),
    'base64',
  )

const upload = async (page: Page, method: 'PUT' | 'POST', path: string, buffer: Buffer) => {
  const res = await page.request.fetch(`${API}/v1${path}`, {
    method,
    headers,
    multipart: { file: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer } },
  })
  expect(res.status(), await res.text()).toBeLessThan(300)
}

const noHorizontalScroll = async (page: Page, what: string) => {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }))
  expect(scroll, `${what} is wider than the screen`).toBeLessThanOrEqual(width + 1)
}

test('publish in the dashboard, then the public page in every template', async ({ page, browser }) => {
  test.setTimeout(420_000)
  const signup = await page.request.post(`${API}/v1/auth/signup`, { headers, data: owner })
  expect(signup.status(), await signup.text()).toBe(201)
  // The dashboard (and its preview) must never send a view beacon (§12.7).
  const dashboardBeacons: string[] = []
  page.on('request', (r) => {
    if (isBeacon(r.url())) dashboardBeacons.push(r.url())
  })
  await page.goto('/')

  // The menu: two categories, a sold-out item, two recommended, one hidden online.
  await api(page, 'PATCH', '/settings', {
    address: 'Jl. Braga No. 12, Bandung',
    tax_enabled: true,
    tax_bps: 1000,
  })
  const kopi = await api(page, 'POST', '/categories', { name: 'Kopi', sort: 1 })
  const makanan = await api(page, 'POST', '/categories', { name: 'Makanan', sort: 2 })
  const item = (category_id: string, name: string, price: number, sort: number) =>
    api(page, 'POST', '/items', { category_id, name, price, sort })
  const kopiSusu = await item(kopi.id, 'Kopi Susu Gula Aren', 25000, 1)
  const latte = await item(kopi.id, 'Latte', 28000, 2)
  const mocha = await item(kopi.id, 'Mocha', 30000, 3)
  const secret = await item(kopi.id, 'Menu Karyawan', 5000, 4)
  const croissant = await item(makanan.id, 'Croissant', 22000, 1)
  await api(page, 'PATCH', `/items/${mocha.id}`, { is_available: false })
  await api(page, 'PATCH', `/items/${secret.id}`, { show_online: false })
  for (const id of [kopiSusu.id, croissant.id])
    await api(page, 'PATCH', `/items/${id}`, { is_recommended: true })
  const today = jakartaWeekday()
  await api(page, 'PUT', '/online-menu/hours', {
    hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
      weekday === today
        ? { weekday, opens: '07:00', closes: '22:00' }
        : { weekday, opens: '08:00', closes: '20:00' },
    ),
  })
  const oldSlug = `kopi-lama-${randomUUID().slice(0, 6)}`
  const slug = `kopi-publik-${randomUUID().slice(0, 6)}`
  await api(page, 'PATCH', '/online-menu', {
    slug: oldSlug,
    description: 'Kopi susu gula aren di tengah Braga.',
  })

  // Not published yet: 404, with noindex.
  const before = await page.request.get(`${MENU}/${oldSlug}`, { headers: { accept: 'text/html' } })
  expect(before.status()).toBe(404)
  expect(await before.text()).toContain('noindex')

  // Change the address and publish, in the dashboard.
  await page.goto('/online-menu')
  await page.getByTestId('slug-change').click()
  await page.getByTestId('slug-input').fill(slug)
  await page.getByTestId('slug-save').click()
  await expect(page.getByTestId('public-url')).toHaveText(`http://localhost:3001/${slug}`)
  await page.getByTestId('publish-switch').click()
  await expect(page.getByTestId('status-badge')).toHaveText('Tayang')

  // The live preview follows an unsaved template choice (desktop width).
  await page.setViewportSize({ width: 1440, height: 900 })
  const preview = page.getByTestId('menu-preview')
  await expect(preview.locator('.zm--papan')).toBeVisible()
  await expect(preview).toContainText('Kopi Susu Gula Aren')
  await page.getByTestId('templates').getByText('Foto', { exact: true }).click()
  await expect(preview.locator('.zm--foto')).toBeVisible()
  await page.getByTestId('templates').getByText('Papan', { exact: true }).click()

  // The public page, in a fresh context (no dashboard cookie) like a customer.
  const visitor = await browser.newContext({ locale: 'id-ID', userAgent: PHONE_1 })
  const pub = await visitor.newPage()
  const problems: string[] = []
  pub.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text())
  })
  pub.on('pageerror', (e) => problems.push(e.message))

  const checkPage = async (template: string, withPhotos: boolean) => {
    for (const [width, height] of [
      [360, 780],
      [1280, 900],
    ] as const) {
      await pub.setViewportSize({ width, height })
      await expect
        .poll(async () => {
          await pub.goto(`${MENU}/${slug}`)
          const root = pub.locator('.zm')
          const cls = (await root.getAttribute('class')) ?? ''
          const covers = await pub.locator('.zm-cover').count()
          return cls.includes(`zm--${template}`) && covers === (withPhotos ? 1 : 0)
        }, CACHE_WAIT)
        .toBe(true)
      const what = `${template} ${withPhotos ? 'photos' : 'no photos'} @${width}`
      await expect(pub.getByRole('heading', { level: 1 })).toHaveText(owner.shop_name)
      await expect(pub.getByTestId('menu-today')).toHaveText('Hari ini 07.00–22.00')
      const rec = pub.getByTestId('menu-recommended')
      await expect(rec).toContainText('Kopi Susu Gula Aren')
      await expect(rec).toContainText('Croissant')
      const items = pub.getByTestId('menu-item')
      await expect(items).toHaveText([
        /Kopi Susu Gula Aren\s*Rp 25\.000.*Rekomendasi/,
        /Latte\s*Rp 28\.000/,
        /Mocha\s*Rp 30\.000\s*Habis/,
        /Croissant\s*Rp 22\.000.*Rekomendasi/,
      ])
      await expect(pub.locator('body')).not.toContainText('Menu Karyawan')
      await expect(pub.getByTestId('menu-price-note')).toHaveText('Harga belum termasuk PB1.')
      await expect(items.locator('img')).toHaveCount(withPhotos ? 4 : 0)
      if (withPhotos) {
        // Every image actually loaded from the media base.
        const broken = await pub.evaluate(async () => {
          window.scrollTo(0, document.body.scrollHeight)
          await new Promise((r) => setTimeout(r, 500))
          return [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length
        })
        expect(broken, what).toBe(0)
      }
      await noHorizontalScroll(pub, what)
    }
  }

  for (const template of TEMPLATES) {
    await api(page, 'PATCH', '/online-menu', { template })
    await checkPage(template, false)
  }

  // Head: canonical, Open Graph and valid JSON-LD.
  const head = await pub.evaluate(() => ({
    title: document.title,
    canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'),
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content'),
    description: document.querySelector('meta[name=description]')?.getAttribute('content'),
    robots: document.querySelector('meta[name=robots]'),
    ld: document.querySelector('script[type="application/ld+json"]')?.textContent ?? '',
  }))
  expect(head).toMatchObject({
    title: `${owner.shop_name} — Menu dan harga`,
    canonical: `http://localhost:3001/${slug}`,
    ogTitle: `${owner.shop_name} — Menu dan harga`,
    ogUrl: `http://localhost:3001/${slug}`,
    description: 'Kopi susu gula aren di tengah Braga.',
    robots: null,
  })
  const ld = JSON.parse(head.ld) as Record<string, unknown> & {
    hasMenu: {
      hasMenuSection: { name: string; hasMenuItem: { name: string; offers: { price: string } }[] }[]
    }
  }
  expect(ld['@type']).toBe('FoodEstablishment')
  expect(ld['address']).toMatchObject({ streetAddress: 'Jl. Braga No. 12, Bandung' })
  expect(ld.hasMenu.hasMenuSection.map((s) => s.name)).toEqual(['Kopi', 'Makanan'])
  expect(ld.hasMenu.hasMenuSection[0]?.hasMenuItem[0]).toMatchObject({
    name: 'Kopi Susu Gula Aren',
    offers: { price: '25000', priceCurrency: 'IDR' },
  })

  // Page budget: HTML + CSS + JS under 150 KB compressed, before images.
  const sizes: { url: string; gz: number }[] = []
  pub.on('response', async (res) => {
    const url = res.url()
    const type = res.headers()['content-type'] ?? ''
    if (!url.startsWith(MENU) || /image\//.test(type)) return
    if (/html|css|javascript/.test(type)) sizes.push({ url, gz: gzipSync(await res.body()).length })
  })
  await pub.goto(`${MENU}/${slug}`)
  await pub.waitForLoadState('networkidle')
  const total = sizes.reduce((n, s) => n + s.gz, 0)
  expect(total, JSON.stringify(sizes)).toBeLessThan(150 * 1024)

  // All photos: items, logo, cover, gallery.
  for (const [i, id] of [kopiSusu.id, latte.id, mocha.id, croissant.id].entries()) {
    await upload(page, 'PUT', `/items/${id}/photo`, await photo(page, 20 + i * 60))
  }
  await upload(page, 'PUT', '/online-menu/cover', await photo(page, 25))
  await upload(page, 'PUT', '/online-menu/logo', await photo(page, 200))
  for (const hue of [90, 150, 300]) await upload(page, 'POST', '/online-menu/gallery', await photo(page, hue))
  for (const template of [...TEMPLATES].reverse()) {
    await api(page, 'PATCH', '/online-menu', { template })
    await checkPage(template, true)
  }
  const ogImage = await pub.locator('meta[property="og:image"]').getAttribute('content')
  expect(ogImage).toMatch(/-1600\.webp$/)

  // The old slug answers 308 to the current one, keeping ?s=qr.
  const moved = await page.request.get(`${MENU}/${oldSlug}?s=qr`, { maxRedirects: 0 })
  expect(moved.status()).toBe(308)
  expect(moved.headers()['location']).toMatch(new RegExp(`/${slug}\\?s=qr$`))

  expect(problems).toEqual([])

  // Views (O3): the first phone opened the page many times → one link view;
  // a second phone scanning the QR code → one QR view, and ?s=qr leaves the URL.
  const scanner = await browser.newContext({ locale: 'id-ID', userAgent: PHONE_2 })
  const scan = await scanner.newPage()
  const sent = scan.waitForRequest((r) => isBeacon(r.url()))
  await scan.goto(`${MENU}/${slug}?s=qr`)
  expect((await sent).postData()).toBe('{"source":"qr"}')
  await expect(scan).toHaveURL(`${MENU}/${slug}`)
  await scanner.close()
  type Views = { today: number; days: { qr: number; link: number }[] }
  const views = async () =>
    (await (await page.request.get(`${API}/v1/online-menu/views`, { headers })).json()) as Views
  await expect
    .poll(async () => (await views()).days.at(-1), { timeout: 10_000 })
    .toMatchObject({ qr: 1, link: 1 })
  expect((await views()).today).toBe(2)
  await page.goto('/online-menu')
  await expect(page.getByTestId('views-today')).toHaveText('2 kali dibuka')
  await expect(page.getByTestId('views-split')).toHaveText('Dalam 30 hari: 1 dari kode QR, 1 dari link.')
  // 30 bars don't fit the card, so the chart opens on the newest day (today).
  const chart = page.getByTestId('views-chart')
  await expect
    .poll(() => chart.evaluate((el) => el.scrollWidth - el.clientWidth - el.scrollLeft))
    .toBeLessThanOrEqual(1)
  expect(await chart.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  expect(dashboardBeacons).toEqual([])

  // Unpublishing → 404 within 15 s.
  await page.getByTestId('publish-switch').click()
  await expect(page.getByTestId('status-badge')).toHaveText('Belum tayang')
  const start = Date.now()
  await expect
    .poll(
      async () => (await page.request.get(`${MENU}/${slug}`, { headers: { accept: 'text/html' } })).status(),
      {
        timeout: 20_000,
        intervals: [500],
      },
    )
    .toBe(404)
  expect(Date.now() - start).toBeLessThan(16_000)
  await visitor.close()
})
