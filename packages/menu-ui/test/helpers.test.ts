import { describe, expect, it } from 'vitest'
import { formatIdr } from '../src/format'
import { formatRange, todayLine, weekdayIn } from '../src/hours'
import { pickLocale, translate } from '../src/i18n'
import { srcset } from '../src/images'
import { jsonLdString, menuSeo } from '../src/seo'
import { MONDAY_10_WIB, img, sampleMenu } from './fixtures'

describe('formatIdr', () => {
  it('formats whole rupiah', () => {
    expect(formatIdr(25000)).toBe('Rp 25.000')
    expect(formatIdr(0)).toBe('Rp 0')
    expect(formatIdr(1250000)).toBe('Rp 1.250.000')
    expect(() => formatIdr(1.5)).toThrow()
  })
})

describe('hours', () => {
  const hours = sampleMenu().shop.hours
  it('uses the calendar day in the shop timezone', () => {
    expect(weekdayIn(MONDAY_10_WIB, 'Asia/Jakarta')).toBe(1)
    // Sunday 23:30 UTC is already Monday 06:30 in Jakarta, still Sunday in London.
    const late = new Date('2026-11-29T23:30:00Z')
    expect(weekdayIn(late, 'Asia/Jakarta')).toBe(1)
    expect(weekdayIn(late, 'Europe/London')).toBe(7)
  })
  it('today line in Indonesian and English', () => {
    expect(todayLine(hours, 'Asia/Jakarta', MONDAY_10_WIB, 'id')).toBe('Hari ini 07.00–22.00')
    expect(todayLine(hours, 'Asia/Jakarta', MONDAY_10_WIB, 'en')).toBe('Today 07:00–22:00')
    const tuesday = new Date('2026-12-01T03:00:00Z')
    expect(todayLine(hours, 'Asia/Jakarta', tuesday, 'id')).toBe('Hari ini tutup')
    expect(todayLine([], 'Asia/Jakarta', tuesday, 'id')).toBeNull()
  })
  it('a range past midnight reads as it is', () => {
    expect(formatRange({ weekday: 5, opens: '18:00', closes: '01:00' }, 'id')).toBe('18.00–01.00')
  })
})

describe('pickLocale', () => {
  it.each([
    ['en-US,en;q=0.9,id;q=0.8', 'en'],
    ['id-ID,id;q=0.9,en;q=0.8', 'id'],
    ['ms-MY,en;q=0.8', 'id'],
    ['', 'id'],
    [undefined, 'id'],
    [['en-GB', 'id'], 'en'],
  ] as const)('%s → %s', (header, locale) => {
    expect(pickLocale(header)).toBe(locale)
  })
  it('fills parameters', () => {
    expect(translate('id', 'title', { name: 'Kopi Demo' })).toBe('Kopi Demo — Menu dan harga')
  })
})

describe('srcset', () => {
  it('lists the small and large variant widths', () => {
    expect(srcset(img('x', 480, 1200, 1200, 900))).toBe(
      'https://media.zurupos.com/m/x0000000000000000000000000000000-480.webp 480w, https://media.zurupos.com/m/x0000000000000000000000000000000-1200.webp 1200w',
    )
  })
  it('a small original has one width', () => {
    expect(srcset(img('y', 480, 1200, 300, 200))).toMatch(/1200\.webp 300w$/)
  })
})

describe('menuSeo', () => {
  const url = 'https://menu.zurupos.com/kopi-demo'
  it('title, description and preview image (cover first, then logo)', () => {
    const withPhotos = menuSeo(sampleMenu({ photos: true }), url, 'id')
    expect(withPhotos.title).toBe('Kopi Demo — Menu dan harga')
    expect(withPhotos.description).toBe('Kopi susu gula aren di tengah Braga.')
    expect(withPhotos.image).toMatch(/-1600\.webp$/)
    expect(withPhotos.twitterCard).toBe('summary_large_image')
    const plain = sampleMenu()
    plain.shop.description = null
    const seo = menuSeo(plain, url, 'id')
    expect(seo.description).toBe('Menu dan harga Kopi Demo: Kopi, Makanan.')
    expect(seo.image).toBeNull()
    expect(seo.twitterCard).toBe('summary')
  })
  it('JSON-LD FoodEstablishment with address, hours and the menu in IDR', () => {
    const ld = menuSeo(sampleMenu(), url, 'id').jsonLd as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- walking JSON
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@type']).toBe('FoodEstablishment')
    expect(ld['url']).toBe(url)
    expect(ld['address']).toEqual({
      '@type': 'PostalAddress',
      streetAddress: 'Jl. Braga No. 12, Bandung',
      addressCountry: 'ID',
    })
    expect(ld['openingHoursSpecification'][1]).toEqual({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: 'https://schema.org/Friday',
      opens: '18:00',
      closes: '01:00',
    })
    const section = ld['hasMenu']['hasMenuSection'][0]
    expect(section.name).toBe('Kopi')
    expect(section.hasMenuItem[2]).toEqual({
      '@type': 'MenuItem',
      name: 'Mocha',
      offers: {
        '@type': 'Offer',
        price: '30000',
        priceCurrency: 'IDR',
        availability: 'https://schema.org/OutOfStock',
      },
    })
  })
  it('jsonLdString cannot close its script tag', () => {
    const s = jsonLdString({ name: '</script><script>alert(1)</script>' })
    expect(s).not.toContain('</script>')
    expect(JSON.parse(s)).toEqual({ name: '</script><script>alert(1)</script>' })
  })
})
