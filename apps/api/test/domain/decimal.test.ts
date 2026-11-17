import { describe, expect, it } from 'vitest'
import { divHalfUp, formatQty, parseCost, parseQty, formatCost } from '../../src/domain/decimal.js'

describe('fixed-point decimals', () => {
  it.each([
    ['18', 18000n],
    ['0.5', 500n],
    ['150.000', 150000n],
    ['0.001', 1n],
    ['-2.25', -2250n],
    ['12.3400', 12340n],
  ])('parseQty(%s)', (input, expected) => {
    expect(parseQty(input)).toBe(expected)
  })

  it('rejects more decimals than the scale and non-decimals', () => {
    expect(() => parseQty('0.0001')).toThrow(/too many decimal places/)
    expect(() => parseQty('1e3')).toThrow(/not a decimal/)
    expect(() => parseQty('')).toThrow(/not a decimal/)
  })

  it('formats canonically', () => {
    expect(formatQty(18000n)).toBe('18')
    expect(formatQty(500n)).toBe('0.5')
    expect(formatQty(-2250n)).toBe('-2.25')
    expect(formatQty(0n)).toBe('0')
    expect(formatCost(parseCost('133.3333'))).toBe('133.3333')
  })

  it('divides half-up', () => {
    expect(divHalfUp(5n, 2n)).toBe(3n)
    expect(divHalfUp(4n, 3n)).toBe(1n)
    expect(divHalfUp(0n, 7n)).toBe(0n)
    expect(() => divHalfUp(1n, 0n)).toThrow()
  })
})
