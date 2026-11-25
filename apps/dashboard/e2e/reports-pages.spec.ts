// M6 exit checks: every owner page renders at 375 px without horizontal scroll,
// and the reports show the right figures for orders taken through the API.
import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const API = process.env.API_URL ?? 'http://localhost:4000'
const ORIGIN = process.env.DASHBOARD_URL ?? 'http://localhost:3000'
const BROWSER = { 'x-requested-with': 'zuru', origin: ORIGIN }
const APP = { 'x-requested-with': 'zuru' }

const owner = {
  shop_name: 'Kopi Laporan E2E',
  name: 'Dina',
  email: `e2e-rep-${randomUUID().slice(0, 8)}@test.zurupos.local`,
  password: 'kopi-susu-aren-2026',
  pin: '2580',
}

const json = async (res: Awaited<ReturnType<APIRequestContext['post']>>) => {
  expect(res.ok(), `${res.url()} ${res.status()} ${await res.text()}`).toBeTruthy()
  return res.status() === 204 ? {} : ((await res.json()) as Record<string, unknown>)
}

// Shop, menu, a cashier on a paired device, two orders (one voided).
const seed = async (page: Page) => {
  const r = page.request // shares the browser's cookies
  await json(await r.post(`${API}/v1/auth/signup`, { headers: BROWSER, data: owner }))
  const post = async (path: string, data: unknown) =>
    json(await r.post(`${API}${path}`, { headers: BROWSER, data }))
  const cat = (await post('/v1/categories', { name: 'Kopi' })).id as string
  const item = (await post('/v1/items', { category_id: cat, name: 'Kopi Susu', price: 25000 })).id as string
  const ingredient = (await post('/v1/ingredients', { name: 'Biji Kopi', base_unit: 'g' })).id as string
  await post('/v1/ingredients', { name: 'Susu Segar', base_unit: 'ml', low_stock_threshold: '1000' })
  const cashier = (await post('/v1/users', { name: 'Kasir', role: 'cashier', pin: '4826' })).id as string
  const pair = await json(
    await r.post(`${API}/v1/devices/pair`, {
      headers: APP,
      data: { email: owner.email, password: owner.password, device_name: 'Tablet' },
    }),
  )
  const device = { ...APP, 'x-device-token': pair.device_token as string }
  const session = await json(
    await r.post(`${API}/v1/device/sessions`, { headers: device, data: { user_id: cashier, pin: '4826' } }),
  )
  const staff = { ...device, authorization: `Bearer ${session.staff_token as string}` }
  const order = async (qty: number, payment: Record<string, unknown>) =>
    (
      await json(
        await r.post(`${API}/v1/orders`, {
          headers: staff,
          data: {
            client_order_id: randomUUID(),
            order_type: 'takeaway',
            customer_name: 'Budi',
            lines: [{ item_id: item, qty }],
            payments: [payment],
          },
        }),
      )
    ).id as string
  const voided = await order(1, { method: 'cash', amount: 25000, tendered: 30000 })
  const paid = await order(2, { method: 'qris', amount: 50000, provider: 'GoPay' })
  await post(`/v1/orders/${voided}/void`, { reason: 'Salah input', restock: false })
  return { paid, ingredient }
}

const noHorizontalScroll = async (page: Page, path: string) => {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }))
  expect(scroll, `${path} is wider than the screen`).toBeLessThanOrEqual(width + 1)
}

test('owner pages at 375 px, with correct report figures', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  // Icons are bundled; a runtime fetch (Iconify API or the local fallback)
  // means one is missing, and production's CSP would block it.
  const iconFetches: string[] = []
  page.on('request', (r) => {
    if (/api\.iconify\.design|\/api\/_nuxt_icon/.test(r.url())) iconFetches.push(r.url())
  })
  const { paid, ingredient } = await seed(page)

  // Home: today's net sales exclude the voided order.
  await page.goto('/')
  await expect(page.getByTestId('today')).toContainText('Rp 50.000')
  // PRD §6 home: low-stock list (no stock yet, threshold 1 L) and today's voids.
  await expect(page.getByTestId('low-stock')).toContainText('Susu Segar')
  await expect(page.getByTestId('low-stock')).not.toContainText('Biji Kopi')
  await expect(page.getByTestId('voids-today')).toContainText('1 pesanan (Rp 25.000)')
  await noHorizontalScroll(page, '/')

  const pages: [string, string][] = [
    ['/reports/sales', 'Rp 50.000'],
    ['/reports/payments', 'GoPay'],
    ['/reports/items', '2 terjual'],
    ['/reports/margin', 'Laba kotor'],
    ['/reports/voids', 'Salah input'],
    ['/orders', 'Batal'],
    [`/orders/${paid}`, 'Rp 50.000'],
    ['/inventory', 'Biji Kopi'],
    [`/inventory/${ingredient}`, 'Belum ada pergerakan stok.'],
    ['/inventory/waste', 'Alasan'],
    ['/inventory/count', 'Biji Kopi'],
    ['/users', 'Kasir'],
    ['/devices', 'Tablet'],
    ['/settings', 'Contoh: pesanan Rp 100.000'],
  ]
  for (const [path, text] of pages) {
    await page.goto(path)
    await expect(page.getByText(text).filter({ visible: true }).first(), path).toBeVisible()
    await expect(page.getByText('Terjadi kesalahan')).toHaveCount(0)
    await noHorizontalScroll(page, path)
  }

  // Heatmap (SPEC §12.4): default 4 weeks end yesterday, so today's order needs today's range.
  await page.goto('/reports/heatmap')
  await expect(page.getByText('Belum ada data').first()).toBeVisible()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  await page.goto(`/reports/heatmap?from=${today}&to=${today}`)
  await expect(page.getByTestId('heatmap-unreliable')).toContainText('Data baru 1 minggu')
  await expect(page.getByTestId('heatmap-insight')).toHaveCount(0)
  await page.getByTestId('heatmap').getByRole('button').first().click()
  await expect(page.getByTestId('heatmap-picked')).toContainText('rata-rata 1,0 pesanan · Rp 50.000')
  // Net sales cells carry the short amount, not just a shade (D-077).
  await page.getByTestId('heatmap-metric').getByText('Penjualan bersih').click()
  await expect(page.getByTestId('heatmap').getByRole('button').first()).toHaveText('50rb')
  await expect(page.getByTestId('heatmap-short-hint')).toContainText('45rb = Rp 45.000')
  await expect(page.getByText('Terjadi kesalahan')).toHaveCount(0)
  await noHorizontalScroll(page, '/reports/heatmap')

  // Menu matrix (SPEC §12.5): the seeded Kopi Susu has no recipe, so the guard shows instead.
  await page.goto(`/reports/menu?from=${today}&to=${today}`)
  await expect(page.getByTestId('matrix-state')).toContainText('Lengkapi HPP dulu')
  await expect(page.getByTestId('matrix-incomplete')).toContainText('Kopi Susu')
  await expect(page.getByTestId('matrix-incomplete')).toContainText('Belum ada resep')
  await expect(page.getByTestId('matrix-coverage')).toContainText('HPP lengkap untuk 0 dari 1 menu (0% dari')
  await expect(page.getByText('Terjadi kesalahan')).toHaveCount(0)
  await noHorizontalScroll(page, '/reports/menu')

  // Stock-in through the form, then the level and the movement show it.
  await page.goto('/inventory/stock-in')
  await noHorizontalScroll(page, '/inventory/stock-in')
  await page.getByTestId('ingredient').click()
  await page
    .getByRole('listbox')
    .last()
    .getByRole('option', { name: /Biji Kopi/ })
    .click()
  await page.getByLabel('Jumlah').fill('1000')
  await page.getByLabel('Total harga beli').fill('300.000')
  await page.getByRole('button', { name: 'Simpan' }).click()
  await expect(page).toHaveURL(/\/inventory$/)
  await expect(page.getByTestId('levels')).toContainText('1.000 g')
  await page.goto(`/inventory/${ingredient}`)
  await expect(page.getByTestId('movements')).toContainText('Stok masuk')
  await expect(page.getByTestId('movements')).toContainText('Rp 300.000')
  expect(iconFetches, 'icons fetched at runtime instead of bundled').toEqual([])
})
