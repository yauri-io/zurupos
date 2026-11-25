import { describe, expect, it } from 'vitest'
import { formatBps, formatIdr, formatIdrShort, parsePercentToBps, parseRupiah } from '../app/utils/money'
import { formatQty, parseQtyInput } from '../app/utils/qty'

describe('formatIdr', () => {
  it.each([
    [0, 'Rp 0'],
    [500, 'Rp 500'],
    [25000, 'Rp 25.000'],
    [1234567, 'Rp 1.234.567'],
    [-5000, '-Rp 5.000'],
  ])('%d → %s', (n, s) => {
    expect(formatIdr(n)).toBe(s)
  })

  it('refuses fractional rupiah', () => {
    expect(() => formatIdr(1.5)).toThrow()
  })
})

describe('formatIdrShort', () => {
  it.each([
    [0, '0', '0'],
    [850, '850', '850'],
    [1000, '1rb', '1k'],
    [4500, '4,5rb', '4.5k'],
    [4549, '4,5rb', '4.5k'],
    [4550, '4,6rb', '4.6k'],
    [9949, '9,9rb', '9.9k'],
    [9950, '10rb', '10k'], // rounding up moves to whole thousands
    [45_499, '45rb', '45k'],
    [45_500, '46rb', '46k'],
    [999_499, '999rb', '999k'],
    [999_500, '1jt', '1M'], // and to millions
    [1_250_000, '1,3jt', '1.3M'],
    [12_400_000, '12jt', '12M'],
    [-45_000, '-45rb', '-45k'],
  ])('%d → %s / %s', (n, id, en) => {
    expect(formatIdrShort(n, 'id')).toBe(id)
    expect(formatIdrShort(n, 'en')).toBe(en)
  })

  it('refuses fractional rupiah', () => {
    expect(() => formatIdrShort(1.5, 'id')).toThrow()
  })
})

describe('parsing input', () => {
  it.each([
    ['25000', 25000],
    ['25.000', 25000],
    ['Rp 25.000', 25000],
    ['rp25000', 25000],
    ['', null],
    ['-1', null],
    ['2,5', null],
    ['abc', null],
  ])('parseRupiah(%s)', (input, expected) => {
    expect(parseRupiah(input)).toBe(expected)
  })

  it.each([
    ['10', 1000],
    ['2,5', 250],
    ['2.55', 255],
    ['100%', 10000],
    ['101', null],
    ['1.234', null],
  ])('parsePercentToBps(%s)', (input, expected) => {
    expect(parsePercentToBps(input)).toBe(expected)
  })

  it('formats bps and quantities without floats', () => {
    expect(formatBps(1000)).toBe('10%')
    expect(formatBps(250)).toBe('2,5%')
    expect(formatQty('1500.5', 'ml')).toBe('1.500,5 ml')
    expect(formatQty('-12')).toBe('-12')
    expect(parseQtyInput('7,5')).toBe('7.5')
    expect(parseQtyInput('150.000')).toBe('150')
    expect(parseQtyInput('0.0001')).toBeNull()
    expect(parseQtyInput('-1')).toBeNull()
  })
})
