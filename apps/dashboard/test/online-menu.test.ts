import { describe, expect, it } from 'vitest'
import {
  SLUG_RE,
  fitWithin,
  hoursBody,
  hoursRows,
  normalizeInstagram,
  normalizeWhatsapp,
  suggestSlug,
  whatsappForDisplay,
} from '../app/utils/online-menu'

describe('suggestSlug', () => {
  it.each([
    ['Kopi Demo', 'kopi-demo'],
    ['Kopi Senja & Roti', 'kopi-senja-roti'],
    ['  Warung Kopi  "Pak Darmo"  ', 'warung-kopi-pak-darmo'],
    ['Café Crème', 'cafe-creme'],
    ['Boba!!!', 'boba'],
    ['K1', 'k1-menu'],
    ['☕', 'menu-toko'],
    ['A'.repeat(60), 'a'.repeat(40)],
    [`${'kopi '.repeat(8)}x`, 'kopi-kopi-kopi-kopi-kopi-kopi-kopi-kopi'],
  ])('%s → %s', (name, slug) => {
    expect(suggestSlug(name)).toBe(slug)
    expect(SLUG_RE.test(suggestSlug(name))).toBe(true)
  })
})

describe('SLUG_RE matches the API pattern', () => {
  it.each(['abc', 'kopi-demo', 'a-b-c', '123', 'x'.repeat(40)])('accepts %s', (s) => {
    expect(SLUG_RE.test(s)).toBe(true)
  })
  it.each(['ab', 'x'.repeat(41), '-abc', 'abc-', 'a--b', 'Kopi', 'kopi_demo', 'kopí'])('rejects %s', (s) => {
    expect(SLUG_RE.test(s)).toBe(false)
  })
})

describe('normalizeWhatsapp', () => {
  it.each([
    ['0812 3456 7890', '6281234567890'],
    ['+62 812-3456-7890', '6281234567890'],
    ['6281234567890', '6281234567890'],
    ['(0812) 345 678', '62812345678'],
    ['', null],
    ['   ', null],
  ])('%s → %s', (input, out) => {
    expect(normalizeWhatsapp(input)).toBe(out)
  })
  it.each(['0812', 'abc', '0812 3456 7890 1234 5', '62'])('%s is invalid', (input) => {
    expect(normalizeWhatsapp(input)).toBe('invalid')
  })
  it('shows stored digits as a local number', () => {
    expect(whatsappForDisplay('6281234567890')).toBe('081234567890')
    expect(whatsappForDisplay(null)).toBe('')
  })
})

describe('normalizeInstagram', () => {
  it.each([
    ['@Kopi.Senja', 'kopi.senja'],
    ['kopi_senja', 'kopi_senja'],
    ['https://www.instagram.com/kopisenja/?hl=id', 'kopisenja'],
    ['instagram.com/kopi.demo', 'kopi.demo'],
    ['', null],
  ])('%s → %s', (input, out) => {
    expect(normalizeInstagram(input)).toBe(out)
  })
  it.each(['kopi senja', 'kopi-senja', 'x'.repeat(31)])('%s is invalid', (input) => {
    expect(normalizeInstagram(input)).toBe('invalid')
  })
})

describe('fitWithin', () => {
  it('shrinks the long side to the limit and keeps the ratio', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 })
  })
  it('never enlarges', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 })
  })
})

describe('hours rows', () => {
  it('seven rows Monday first; days without a row are closed', () => {
    const rows = hoursRows([{ weekday: 7, opens: '08:00', closes: '20:00' }])
    expect(rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(rows.filter((r) => r.open).map((r) => r.weekday)).toEqual([7])
  })
  it('round-trips to the API body with only the open days', () => {
    const saved = [
      { weekday: 1, opens: '07:00', closes: '22:00' },
      { weekday: 5, opens: '18:00', closes: '01:00' },
    ]
    expect(hoursBody(hoursRows(saved))).toEqual(saved)
  })
})
