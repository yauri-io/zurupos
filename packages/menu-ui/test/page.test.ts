// The page renders every template with no photos, some and all (SPEC §12.7),
// in the fixed order (D-078), and leaves out missing parts.
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import MenuPage from '../src/components/MenuPage.vue'
import type { Locale } from '../src/i18n'
import type { PublicMenu } from '../src/types'
import { MONDAY_10_WIB, sampleMenu } from './fixtures'

const render = (menu: PublicMenu, locale: Locale = 'id') =>
  renderToString(
    createSSRApp({
      render: () => h(MenuPage, { menu, locale, landingUrl: 'https://zurupos.com', now: MONDAY_10_WIB }),
    }),
  )

const order = (html: string, markers: string[]) => markers.map((m) => html.indexOf(m))

describe('MenuPage', () => {
  for (const template of ['foto', 'papan', 'hangat'] as const) {
    for (const photos of [false, true]) {
      it(`${template}, ${photos ? 'all photos' : 'no photos'}: content and fixed order`, async () => {
        const html = await render(sampleMenu({ template, photos }))
        expect(html).toContain(`zm--${template}`)
        const positions = order(html, [
          'Kopi Demo</h1>',
          'Hari ini 07.00–22.00',
          'Jl. Braga No. 12',
          'Buka peta',
          '>Rekomendasi</h2>',
          'zm-tabs',
          '>Kopi</h2>',
          '>Makanan</h2>',
          'Harga belum termasuk PB1 dan biaya layanan.',
          'Menu oleh ZuruPOS',
        ])
        expect(
          positions.every((p) => p >= 0),
          String(positions),
        ).toBe(true)
        expect([...positions].sort((a, b) => a - b)).toEqual(positions)
        expect(html).toContain('Rp 25.000')
        expect(html).toContain('>Habis<')
        expect(html).toContain('https://wa.me/6281234567890')
        expect(html).toContain('https://www.instagram.com/kopi.demo/')
        expect(html.includes('.webp')).toBe(photos)
        expect(html.includes('zm-cover')).toBe(photos)
        expect(html.includes('>Galeri</h2>')).toBe(photos)
        if (photos) expect(html.indexOf('zm-cover')).toBeLessThan(html.indexOf('Kopi Demo</h1>'))
      })
    }
  }

  it('some photos: items without one get no photo slot', async () => {
    const menu = sampleMenu({ template: 'foto', photos: true })
    const latte = menu.categories[0]?.items[1]
    if (latte) latte.photo = null
    const html = await render(menu)
    expect(html.match(/class="zm-item-photo"/g)?.length).toBe(5) // 4 items + 2 recommended − Latte
  })

  it('leaves out every missing part', async () => {
    const menu = sampleMenu()
    Object.assign(menu.shop, {
      description: null,
      address: null,
      whatsapp: null,
      instagram: null,
      maps_url: null,
      hours: [],
      price_note: null,
    })
    menu.recommended = []
    const html = await render(menu)
    for (const gone of [
      'zm-desc',
      'zm-hours',
      'zm-contact',
      'zm-rec',
      'zm-note',
      'zm-gallery',
      'zm-cover',
      'zm-logo',
    ]) {
      expect(html, gone).not.toContain(`class="${gone}`)
    }
    expect(html).toContain('Menu oleh ZuruPOS')
  })

  it('one category needs no tabs; only the price parts that apply', async () => {
    const menu = sampleMenu()
    menu.categories = menu.categories.slice(0, 1)
    menu.shop.price_note = { tax_name: null, service_charge: true }
    const html = await render(menu)
    expect(html).not.toContain('zm-tabs')
    expect(html).toContain('Harga belum termasuk biaya layanan.')
  })

  it('English', async () => {
    const html = await render(sampleMenu(), 'en')
    expect(html).toContain('Today 07:00–22:00')
    expect(html).toContain('Sold out')
    expect(html).toContain('Prices exclude PB1 and service charge.')
  })

  it('the accent colours are set as tokens on the root', async () => {
    const menu = sampleMenu()
    menu.shop.accent_color = '#fff9c4'
    const html = await render(menu)
    expect(html).toContain('--zm-accent:#fff9c4')
    expect(html).toContain('--zm-on-accent:#111111')
    expect(html).not.toContain('--zm-accent-text:#fff9c4')
  })
})
