import { describe, expect, it } from 'vitest'
import { formatBps, formatIdr, parsePercentToBps, parseRupiah } from '../app/utils/money'
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
