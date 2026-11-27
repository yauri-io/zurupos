// O1 (SPEC §12.7): the owner sets up the online menu on a phone-sized screen:
// address, publish, QR download and A6 card, look, profile with photos shrunk
// in the browser, hours and gallery; the item page's "Menu online" card.
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const API = process.env.API_URL ?? 'http://localhost:4000'
const ORIGIN = process.env.DASHBOARD_URL ?? 'http://localhost:3000'
const headers = { 'x-requested-with': 'zuru', origin: ORIGIN }

const owner = {
  shop_name: `Kopi Senja ${randomUUID().slice(0, 4)}`,
  name: 'Rani',
  email: `e2e-${randomUUID().slice(0, 8)}@test.zurupos.local`,
  password: 'kopi-susu-aren-2026',
  pin: '2580',
}

const noHorizontalScroll = async (page: Page, what: string) => {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }))
  expect(scroll, `${what} is wider than the screen`).toBeLessThanOrEqual(width + 1)
}

// A big "phone photo" made in the browser: 3000×2000 JPEG of noise, over 2 MB.
const phonePhoto = async (page: Page): Promise<Buffer> => {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 3000
    canvas.height = 2000
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    const img = ctx.createImageData(3000, 2000)
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (i * 7) % 255
      img.data[i + 1] = Math.floor(Math.random() * 255)
      img.data[i + 2] = (i * 13) % 255
      img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.98).split(',')[1] ?? ''
  })
  return Buffer.from(base64, 'base64')
}

test('owner sets up the online menu at 375 px', async ({ page }) => {
  const signup = await page.request.post(`${API}/v1/auth/signup`, { headers, data: owner })
  expect(signup.status(), await signup.text()).toBe(201)
  const photo = await (async () => {
    await page.goto('/')
    return phonePhoto(page)
  })()
  expect(photo.length).toBeGreaterThan(2 * 1024 * 1024)

  // The owner finds it in the sidebar (managers don't: online_menu.manage).
  await page.goto('/')
  await page.getByRole('navigation').getByRole('link', { name: 'Menu online' }).click()
  await expect(page).toHaveURL(/\/online-menu$/)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload()

  // Address: suggested from the shop name, saved, then shown as a link.
  const slugInput = page.getByTestId('slug-input')
  const suggested = owner.shop_name.toLowerCase().replace(/\s+/g, '-')
  await expect(slugInput).toHaveValue(suggested)
  // The domain label sits beside the field and never covers the typed text.
  const prefix = await page.getByTestId('slug-prefix').boundingBox()
  const field = await slugInput.boundingBox()
  if (!prefix || !field) throw new Error('slug field not laid out')
  expect(field.x).toBeGreaterThanOrEqual(prefix.x + prefix.width - 1)
  expect(field.x + field.width).toBeLessThanOrEqual(375)
  await page.getByTestId('slug-save').click()
  await expect(page.getByTestId('public-url')).toHaveText(`http://localhost:3001/${suggested}`)
  await noHorizontalScroll(page, '/online-menu')

  // Publish.
  await expect(page.getByTestId('status-badge')).toHaveText('Belum tayang')
  await page.getByTestId('publish-switch').click()
  await expect(page.getByTestId('status-badge')).toHaveText('Tayang')

  // QR: a 1024 px PNG, and the printable A6 card.
  await expect(page.getByTestId('qr-preview')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByTestId('qr-download').click()
  const file = await download
  expect(file.suggestedFilename()).toBe(`menu-${suggested}-qr.png`)
  const png = await readFile((await file.path()) ?? '')
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1024, 1024])
  const [card] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('qr-card').click()])
  await expect(card.getByTestId('a6-card')).toContainText(owner.shop_name)
  await expect(card.getByTestId('a6-card')).toContainText(`localhost:3001/${suggested}`)
  await card.close()

  // Look.
  await page.getByTestId('templates').getByText('Hangat', { exact: true }).click()
  await page.getByTestId('accent-input').fill('#C8873A')
  await page.getByTestId('save-look').click()
  await expect(page.getByText('Tersimpan').first()).toBeVisible()

  // Profile: the 3000×2000 photo is shrunk in the browser, then accepted.
  await page.getByTestId('logo').getByTestId('photo-input').setInputFiles({
    name: 'logo.jpg',
    mimeType: 'image/jpeg',
    buffer: photo,
  })
  await expect(page.getByTestId('logo').locator('img')).toHaveAttribute(
    'src',
    /\/media\/m\/[0-9a-f]{32}-128\.webp$/,
  )
  await page.getByTestId('cover').getByTestId('photo-input').setInputFiles({
    name: 'cover.jpg',
    mimeType: 'image/jpeg',
    buffer: photo,
  })
  await expect(page.getByTestId('cover').locator('img')).toHaveAttribute('src', /-800\.webp$/)
  // The cover is 1600 wide at most: the browser sent ≤ 2000 px, the server never upscales.
  await expect(page.getByTestId('cover').locator('img')).toHaveAttribute('width', '1600')

  await page.getByTestId('description').fill('Kopi susu gula aren sejak 2019.')
  await expect(page.getByTestId('description-counter')).toHaveText('31/160')
  await page.getByTestId('whatsapp').fill('0812 3456 7890')
  await page.getByTestId('instagram').fill('@KopiSenja')
  await page.getByTestId('maps').fill('https://maps.app.goo.gl/abc')
  await page.getByTestId('save-profile').click()
  await expect(page.getByText('Tersimpan').first()).toBeVisible()

  // Hours: Monday 07:00–22:00 copied to every day, Sunday closed.
  const monday = page.getByTestId('hours-1')
  await monday.getByRole('switch').click()
  await monday.getByLabel('Jam buka').fill('07:00')
  await monday.getByLabel('Jam tutup').fill('22:00')
  await monday.getByRole('button', { name: 'Samakan semua hari' }).click()
  await page.getByTestId('hours-7').getByRole('switch').click()
  await page.getByTestId('save-hours').click()
  await expect(page.getByText('Tersimpan').first()).toBeVisible()

  // Gallery.
  await page
    .getByTestId('gallery-input')
    .setInputFiles({ name: 'toko.jpg', mimeType: 'image/jpeg', buffer: photo })
  await expect(page.getByTestId('gallery-count')).toHaveText('1/6')
  await noHorizontalScroll(page, '/online-menu (filled)')

  // Everything survives a reload.
  await page.reload()
  await expect(page.getByTestId('whatsapp')).toHaveValue('081234567890')
  await expect(page.getByTestId('instagram')).toHaveValue('kopisenja')
  await expect(page.getByTestId('hours-6').getByRole('switch')).toBeChecked()
  await expect(page.getByTestId('hours-7').getByRole('switch')).not.toBeChecked()
  await expect(page.getByTestId('gallery').locator('img')).toHaveCount(1)
  await expect(page.getByTestId('status-badge')).toHaveText('Tayang')

  // The item page's "Menu online" card.
  const post = async (path: string, data: object) => {
    const res = await page.request.post(`${API}/v1${path}`, { headers, data })
    expect(res.status(), await res.text()).toBe(201)
    return ((await res.json()) as { id: string }).id
  }
  const cat = await post('/categories', { name: 'Kopi' })
  const item = await post('/items', { category_id: cat, name: 'Kopi Susu Gula Aren', price: 25000 })
  await page.goto(`/menu/items/${item}`)
  const online = page.getByTestId('online-card')
  await expect(online.getByTestId('recommended-count')).toHaveText('0/5 menu rekomendasi')
  await online.getByTestId('recommended').click()
  await expect(online.getByTestId('recommended-count')).toHaveText('1/5 menu rekomendasi')
  await online.getByTestId('show-online').click()
  await expect(online.getByTestId('show-online')).not.toBeChecked()
  await online
    .getByTestId('photo-input')
    .setInputFiles({ name: 'kopi.jpg', mimeType: 'image/jpeg', buffer: photo })
  await expect(online.locator('img')).toHaveAttribute('src', /-480\.webp$/)
  await noHorizontalScroll(page, '/menu/items/:id')
  await page.reload()
  await expect(page.getByTestId('online-card').getByTestId('recommended')).toBeChecked()
  await expect(page.getByTestId('online-card').getByTestId('show-online')).not.toBeChecked()
})
