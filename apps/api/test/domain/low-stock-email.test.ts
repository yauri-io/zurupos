import { describe, expect, it } from 'vitest'
import { parseQty } from '../../src/domain/decimal.js'
import { formatStock } from '../../src/outbox/templates/format-qty.js'
import { renderLowStock } from '../../src/outbox/templates/low-stock.js'

describe('formatStock', () => {
  it.each([
    ['1500', 'g', 'id', '1,5 kg'],
    ['1500', 'g', 'en', '1.5 kg'],
    ['999.5', 'ml', 'id', '999,5 ml'],
    ['12000', 'ml', 'id', '12 L'],
    ['1234567', 'g', 'id', '1.234,57 kg'],
    ['1005', 'g', 'id', '1,01 kg'],
    ['-2500', 'ml', 'id', '-2,5 L'],
    ['1500', 'pcs', 'id', '1.500 pcs'],
    ['0', 'pcs', 'en', '0 pcs'],
  ])('%s %s (%s) → %s', (qty, unit, locale, expected) => {
    expect(formatStock(parseQty(qty), unit, locale as 'id' | 'en')).toBe(expected)
  })
})

describe('renderLowStock', () => {
  const line = (name: string) => ({
    name,
    baseUnit: 'ml',
    stockQty: parseQty('500'),
    threshold: parseQty('1000'),
  })

  it('lists up to three names in the subject, then "+n lainnya"', () => {
    const email = renderLowStock({
      locale: 'id',
      shopName: 'Kopi Demo',
      lines: ['Susu Segar', 'Susu Oat', 'Gula Aren', 'Es Batu', 'Sirup'].map(line),
      link: 'http://localhost:3000/inventory',
    })
    expect(email.subject).toBe('[ZuruPOS] Stok menipis: Susu Segar, Susu Oat, Gula Aren +2 lainnya')
    expect(email.text).toContain('- Es Batu: 500 ml (batas 1 L)')
    expect(email.text).toContain('http://localhost:3000/inventory')
  })

  it('escapes names in HTML', () => {
    const email = renderLowStock({
      locale: 'en',
      shopName: '<Kopi>',
      lines: [line('Milk & <b>Oat</b>')],
      link: 'http://x/inventory',
    })
    expect(email.subject).toBe('[ZuruPOS] Low stock: Milk & <b>Oat</b>')
    expect(email.html).toContain('Milk &amp; &lt;b&gt;Oat&lt;/b&gt;')
    expect(email.html).not.toContain('<Kopi>')
  })
})
