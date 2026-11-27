import type { PublicImg, PublicItem, PublicMenu } from '../src/types'

export const img = (
  key: string,
  small: number,
  large: number,
  w = large,
  h = Math.round((large * 3) / 4),
): PublicImg => ({
  url_small: `https://media.zurupos.com/m/${key.padEnd(32, '0')}-${small}.webp`,
  url_large: `https://media.zurupos.com/m/${key.padEnd(32, '0')}-${large}.webp`,
  width: w,
  height: h,
})

const item = (id: string, name: string, price: number, extra: Partial<PublicItem> = {}): PublicItem => ({
  id: `00000000-0000-4000-8000-${id.padStart(12, '0')}`,
  name,
  price,
  sold_out: false,
  recommended: false,
  photo: null,
  ...extra,
})

// The demo shop's shape: two categories, a sold-out item, two recommended.
export const sampleMenu = (
  opts: { photos?: boolean; template?: 'foto' | 'papan' | 'hangat' } = {},
): PublicMenu => {
  const photo = (k: string) => (opts.photos ? img(k, 480, 1200) : null)
  const kopiSusu = item('1', 'Kopi Susu Gula Aren', 25000, { recommended: true, photo: photo('a1') })
  const latte = item('2', 'Latte', 28000, { photo: photo('a2') })
  const mocha = item('3', 'Mocha', 30000, { sold_out: true, photo: photo('a3') })
  const croissant = item('4', 'Croissant', 22000, { recommended: true, photo: photo('a4') })
  return {
    kind: 'menu',
    shop: {
      name: 'Kopi Demo',
      description: 'Kopi susu gula aren di tengah Braga.',
      address: 'Jl. Braga No. 12, Bandung',
      timezone: 'Asia/Jakarta',
      template: opts.template ?? 'papan',
      accent_color: '#6b4f3a',
      logo: opts.photos ? img('b1', 128, 512, 512, 512) : null,
      cover: opts.photos ? img('b2', 800, 1600, 1600, 700) : null,
      whatsapp: '6281234567890',
      instagram: 'kopi.demo',
      maps_url: 'https://maps.app.goo.gl/abc',
      hours: [
        { weekday: 1, opens: '07:00', closes: '22:00' },
        { weekday: 5, opens: '18:00', closes: '01:00' },
        { weekday: 7, opens: '08:00', closes: '20:00' },
      ],
      price_note: { tax_name: 'PB1', service_charge: true },
    },
    recommended: [kopiSusu.id, croissant.id],
    categories: [
      { id: '00000000-0000-4000-8000-0000000000c1', name: 'Kopi', items: [kopiSusu, latte, mocha] },
      { id: '00000000-0000-4000-8000-0000000000c2', name: 'Makanan', items: [croissant] },
    ],
    gallery: opts.photos ? [img('c1', 480, 1200), img('c2', 480, 1200)] : [],
    menu_version: 'v1',
  }
}

// Monday 2026-11-30 10:00 in Jakarta (03:00 UTC).
export const MONDAY_10_WIB = new Date('2026-11-30T03:00:00Z')
