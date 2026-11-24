// node --test apps/landing/test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculate,
  formatPercent,
  formatQty,
  formatRupiah,
  ingredientCostMilli,
  parsePercentBp,
  parseQty,
  parseRupiah,
  shareBp,
  suggestedPrice,
  totalRupiah,
} from '../hpp-math.js'

test('parseRupiah reads Indonesian-formatted prices', () => {
  assert.equal(parseRupiah('150000'), 150000n)
  assert.equal(parseRupiah('150.000'), 150000n)
  assert.equal(parseRupiah('Rp 150.000'), 150000n)
  assert.equal(parseRupiah('Rp150.000,00'), 150000n)
  assert.equal(parseRupiah('0'), 0n)
  assert.equal(parseRupiah(''), null)
  assert.equal(parseRupiah('abc'), null)
  assert.equal(parseRupiah('12a'), null)
  assert.equal(parseRupiah('-5000'), null)
})

test('parseQty reads decimals and thousands separators', () => {
  assert.equal(parseQty('18'), 18000n)
  assert.equal(parseQty('0,5'), 500n)
  assert.equal(parseQty('0.25'), 250n)
  assert.equal(parseQty('1.000'), 1000000n)
  assert.equal(parseQty('1.000,5'), 1000500n)
  assert.equal(parseQty('12.500.000'), 12500000000n)
  assert.equal(parseQty('1.5'), 1500n)
  assert.equal(parseQty('0,0001'), null)
  assert.equal(parseQty('-1'), null)
  assert.equal(parseQty(''), null)
  assert.equal(parseQty('1 kg'), null)
})

test('ingredient cost is price / pack * use, half up, in milli-rupiah', () => {
  assert.equal(ingredientCostMilli(150000n, 1000000n, 18000n), 2700000n)
  // 10.000 / 3 * 1 = 3.333,333...
  assert.equal(ingredientCostMilli(10000n, 3000n, 1000n), 3333333n)
  // 0,0005 rounds up
  assert.equal(ingredientCostMilli(1n, 2000000n, 1000n), 1n)
  assert.equal(ingredientCostMilli(1000n, 0n, 1000n), null)
})

test('the total is rounded once, not per ingredient', () => {
  // Three rows of Rp 0,4 each: per-row rounding would give 0, the total is 1.
  assert.equal(totalRupiah([400n, 400n, 400n]), 1n)
  assert.equal(totalRupiah([499n]), 0n)
  assert.equal(totalRupiah([500n]), 1n)
})

test('shares, targets and suggested prices', () => {
  assert.equal(shareBp(8200n, 22000n), 3727n)
  assert.equal(shareBp(-1000n, 20000n), -500n)
  assert.equal(shareBp(1n, 0n), null)
  assert.equal(parsePercentBp('30'), 3000n)
  assert.equal(parsePercentBp('30,5'), 3050n)
  assert.equal(parsePercentBp('0'), null)
  assert.equal(parsePercentBp('100'), null)
  assert.equal(parsePercentBp('30,55'), 3055n)
  assert.equal(parsePercentBp('30,555'), null)
  // 8.200 / 30% = 27.333,3 -> 27.334 -> up to the next 500
  assert.equal(suggestedPrice(8200n, 3000n), 27500n)
  assert.equal(suggestedPrice(9000n, 3000n), 30000n)
  assert.equal(suggestedPrice(0n, 3000n), null)
})

test('formatting', () => {
  assert.equal(formatRupiah(0n), 'Rp 0')
  assert.equal(formatRupiah(1234567n), 'Rp 1.234.567')
  assert.equal(formatRupiah(-1500n), '−Rp 1.500')
  assert.equal(formatPercent(3727n), '37,3%')
  assert.equal(formatPercent(3000n), '30,0%')
  assert.equal(formatPercent(-500n), '−5,0%')
  assert.equal(formatQty(500n), '0,5')
  assert.equal(formatQty(1000000n), '1.000')
  assert.equal(formatQty(18250n), '18,25')
})

test('the page example: Kopi Susu Gula Aren', () => {
  const r = calculate({
    ingredients: [
      { price: '150.000', pack: '1.000', use: '18' },
      { price: '20.000', pack: '1.000', use: '150' },
      { price: '40.000', pack: '1.000', use: '25' },
      { price: '10.000', pack: '5.000', use: '150' },
      { price: '60.000', pack: '50', use: '1' },
    ],
    sellPrice: '22.000',
    targetPercent: '30',
  })
  assert.deepEqual(
    r.rows.map((x) => x.cost),
    [2700n, 3000n, 1000n, 300n, 1200n],
  )
  assert.equal(r.hpp, 8200n)
  assert.equal(r.hppBp, 3727n)
  assert.equal(r.profit, 13800n)
  assert.equal(r.suggested, 27500n)
})

test('an unfinished row blocks the total but still flags what is wrong', () => {
  const r = calculate({
    ingredients: [
      { price: '150.000', pack: '1.000', use: '18' },
      { price: '', pack: '0', use: '1' },
    ],
    sellPrice: '',
    targetPercent: '30',
  })
  assert.equal(r.rows[0].cost, 2700n)
  assert.deepEqual(r.rows[1].errors, { price: true, pack: true, use: false })
  assert.equal(r.hpp, null)
  assert.equal(r.hppBp, null)
  assert.equal(r.suggested, null)
})
