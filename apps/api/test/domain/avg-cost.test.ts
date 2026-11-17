import { describe, expect, it } from 'vitest'
import { costOf, toRupiah, unitCostOf, weightedAverageCost } from '../../src/domain/avg-cost.js'
import { formatCost, parseCost, parseQty } from '../../src/domain/decimal.js'

const avg = (stock: string, avgCost: string, qty: string, total: number) =>
  formatCost(
    weightedAverageCost({
      stockQty: parseQty(stock),
      avgCost: parseCost(avgCost),
      qty: parseQty(qty),
      totalCost: BigInt(total),
    }),
  )

describe('weightedAverageCost (SPEC §7.4)', () => {
  it('first purchase sets the average to the purchase unit cost', () => {
    // 12 000 ml of milk for Rp 216.000 → Rp 18 / ml
    expect(avg('0', '0', '12000', 216000)).toBe('18')
  })

  it('blends with stock on hand', () => {
    // 1 000 g @ 200 + 1 000 g for Rp 260.000 → (200 000 + 260 000) / 2 000 = 230
    expect(avg('1000', '200', '1000', 260000)).toBe('230')
  })

  it('treats negative stock as zero on hand', () => {
    expect(avg('-500', '200', '1000', 250000)).toBe('250')
  })

  it('rounds to 4 decimals half-up', () => {
    // 3 pcs for Rp 1.000 → 333.3333…
    expect(avg('0', '0', '3', 1000)).toBe('333.3333')
    // 3 pcs for Rp 2.000 → 666.6666… → 666.6667
    expect(avg('0', '0', '3', 2000)).toBe('666.6667')
  })

  it('handles fractional quantities exactly', () => {
    // 0.5 kg of tea at Rp 75.000 on top of 0.25 kg @ 120/g
    expect(avg('250', '120', '500', 75000)).toBe('140')
  })

  it('a free stock-in lowers the average', () => {
    expect(avg('100', '50', '100', 0)).toBe('25')
  })

  it('rejects zero quantity', () => {
    expect(() => avg('0', '0', '0', 1000)).toThrow()
  })
})

describe('cost helpers', () => {
  it('unit cost of a purchase', () => {
    expect(formatCost(unitCostOf(parseQty('12000'), 216000n))).toBe('18')
    expect(formatCost(unitCostOf(parseQty('3'), 1000n))).toBe('333.3333')
  })

  it('qty × unit cost, and rupiah rounding', () => {
    // 18 g × 233.3333 = 4 199.9994 → Rp 4.200
    const c = costOf(parseQty('18'), parseCost('233.3333'))
    expect(formatCost(c)).toBe('4199.9994')
    expect(toRupiah(c)).toBe(4200n)
    // 0.5 ml × 0.0001 = 0.00005 → 0.0001 (half-up at 4 dp)
    expect(formatCost(costOf(parseQty('0.5'), parseCost('0.0001')))).toBe('0.0001')
    expect(toRupiah(parseCost('0.5'))).toBe(1n)
    expect(toRupiah(parseCost('0.4999'))).toBe(0n)
  })
})
