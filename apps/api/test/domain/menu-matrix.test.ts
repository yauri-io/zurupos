import { describe, expect, it } from 'vitest'
import { divRound } from '../../src/domain/decimal.js'
import { buildMenuMatrix, type MatrixItemInput } from '../../src/domain/menu-matrix.js'

const item = (
  name: string,
  qty: number,
  net: number,
  cogs: number,
  extra: Partial<MatrixItemInput> = {},
): MatrixItemInput => ({
  itemId: `id-${name}`,
  name,
  archived: false,
  qty: BigInt(qty),
  net: BigInt(net),
  cogs: BigInt(cogs),
  zeroCogsLines: 0,
  hasRecipe: true,
  uncostedIngredients: [],
  ...extra,
})

describe('divRound (SPEC §12.4 div, any sign)', () => {
  it.each([
    [5n, 2n, 3n],
    [4n, 3n, 1n],
    [-5n, 2n, -2n], // −2,5 → −2 (towards +∞)
    [-7n, 2n, -3n],
    [-1n, 3n, 0n],
    [-2n, 3n, -1n],
    [-5000n, 3n, -1667n],
  ])('div(%s, %s) = %s', (a, b, expected) => {
    expect(divRound(a, b)).toBe(expected)
  })
  it('rejects a non-positive denominator', () => {
    expect(() => divRound(1n, 0n)).toThrow()
  })
})

describe('buildMenuMatrix (SPEC §12.5, D-073)', () => {
  // N 4, Q 100, M 1 040 000 → average margin per portion Rp 10.400.
  // Popular: qty × 4 × 10 ≥ 700 → qty ≥ 17,5. High: margin × 100 ≥ 1 040 000 × qty.
  const four = [
    item('Kopi Susu', 40, 1_000_000, 400_000), // Rp 15.000 / portion, popular
    item('Es Teh', 40, 600_000, 400_000), // Rp 5.000, popular
    item('Latte Aren', 10, 300_000, 100_000), // Rp 20.000
    item('Air Mineral', 10, 100_000, 60_000), // Rp 4.000
  ]

  it('places each item in its quadrant', () => {
    const m = buildMenuMatrix(four, 30)
    expect(m.state).toBe('ok')
    expect(m.coverageBps).toBe(10_000n)
    expect(m.avgMarginPerPortion).toBe(10_400n)
    expect(m.items.map((i) => [i.name, i.quadrant, i.marginPerPortion])).toEqual([
      ['Kopi Susu', 'andalan', 15_000n],
      ['Es Teh', 'naikkan_harga', 5_000n],
      ['Latte Aren', 'promosikan', 20_000n],
      ['Air Mineral', 'evaluasi', 4_000n],
    ])
  })

  it('suggests a price rise for naikkan_harga only, in whole Rp 1.000, scaled to 30 days', () => {
    // Gap 10 400 − 5 000 = 5 400 → Rp 6.000, but Es Teh sells at Rp 15.000 a portion:
    // capped at 10 % = 1 500 → Rp 2.000 (D-076). 40 sold in 15 days → 2 000 × 40 × 30 / 15.
    const m = buildMenuMatrix(four, 15)
    const esTeh = m.items.find((i) => i.name === 'Es Teh')
    expect(esTeh).toMatchObject({ suggestedIncrease: 2_000n, extra30d: 160_000n })
    for (const i of m.items.filter((x) => x.quadrant !== 'naikkan_harga')) {
      expect(i).toMatchObject({ suggestedIncrease: null, extra30d: null })
    }
  })

  it('closes the whole gap when it is under the 10 % cap (D-076)', () => {
    // Rp 50.000 a portion → cap Rp 5.000; gap 10 400 − 5 000 = 5 400 → Rp 6.000 → capped to 5 000.
    // Rp 100.000 a portion → cap Rp 10.000 → the full Rp 6.000.
    const at = (price: number) =>
      buildMenuMatrix(
        [
          item('A', 40, 40 * price, 40 * price - 600_000), // margin 15 000 / portion
          item('B', 40, 40 * price, 40 * price - 200_000), // margin 5 000 / portion
          item('C', 10, 10 * price, 10 * price - 200_000), // margin 20 000 / portion
          item('D', 10, 10 * price, 10 * price - 40_000), // margin 4 000 / portion
        ],
        30,
      ).items.find((i) => i.name === 'B')?.suggestedIncrease
    expect(at(50_000)).toBe(5_000n)
    expect(at(100_000)).toBe(6_000n)
  })

  it('suggests at least Rp 1.000 when the gap is tiny', () => {
    // M 520 050 + 519 950 + 10 400 = 1 050 400 over Q 101 → average Rp 10.400; B earns 10 399.
    const m = buildMenuMatrix(
      [
        item('A', 50, 1_000_000, 479_950), // 10 401 per portion
        item('B', 50, 1_000_000, 480_050), // 10 399 per portion
        item('C', 1, 20_400, 10_000), // 10 400 per portion
      ],
      30,
    )
    expect(m.avgMarginPerPortion).toBe(10_400n)
    expect(m.items.find((i) => i.name === 'B')).toMatchObject({
      quadrant: 'naikkan_harga',
      suggestedIncrease: 1_000n,
      extra30d: 50_000n,
    })
  })

  it('counts exactly 70% of an equal share as popular and exactly the average as high margin', () => {
    // Q 40, N 4: qty 7 → 7 × 40 = 280 = 40 × 7. Every item earns Rp 1.000 a portion.
    const m = buildMenuMatrix(
      [
        item('Tujuh', 7, 21_000, 14_000),
        item('Enam', 6, 18_000, 12_000),
        item('Tiga belas', 13, 39_000, 26_000),
        item('Empat belas', 14, 42_000, 28_000),
      ],
      30,
    )
    const q = Object.fromEntries(m.items.map((i) => [i.name, i.quadrant]))
    expect(q).toEqual({
      Tujuh: 'andalan',
      Enam: 'promosikan',
      'Tiga belas': 'andalan',
      'Empat belas': 'andalan',
    })
  })

  it('handles a negative margin, rounding the per-portion value', () => {
    const m = buildMenuMatrix([...four, item('Rugi', 3, 10_000, 15_000)], 30)
    expect(m.items.find((i) => i.name === 'Rugi')).toMatchObject({
      margin: -5_000n,
      marginPerPortion: -1_667n,
      quadrant: 'evaluasi',
    })
  })

  it('keeps items with incomplete costs out, with every reason and the ingredient names', () => {
    const m = buildMenuMatrix(
      [
        ...four,
        item('Tanpa resep', 5, 50_000, 0, { hasRecipe: false, zeroCogsLines: 5 }),
        item('Oat', 8, 200_000, 50_000, { uncostedIngredients: ['Susu Oat'] }),
        item('Baru dilengkapi', 2, 40_000, 5_000, { zeroCogsLines: 1 }),
      ],
      30,
    )
    expect(m.items.map((i) => i.name)).not.toContain('Oat')
    expect(m.incomplete).toEqual([
      {
        itemId: 'id-Oat',
        name: 'Oat',
        archived: false,
        net: 200_000n,
        reasons: ['ingredient_without_cost'],
        ingredients: ['Susu Oat'],
      },
      {
        itemId: 'id-Tanpa resep',
        name: 'Tanpa resep',
        archived: false,
        net: 50_000n,
        reasons: ['no_recipe', 'sold_without_cost'],
        ingredients: [],
      },
      {
        itemId: 'id-Baru dilengkapi',
        name: 'Baru dilengkapi',
        archived: false,
        net: 40_000n,
        reasons: ['sold_without_cost'],
        ingredients: [],
      },
    ])
    // 2 000 000 of 2 290 000 → 87,34 %.
    expect(m.coverageBps).toBe(8734n)
    expect(m.state).toBe('ok')
  })

  it('shows no quadrants below 50% coverage, but does at exactly 50%', () => {
    const half = [
      item('A', 10, 100_000, 10_000),
      item('B', 10, 100_000, 20_000),
      item('C', 10, 100_000, 30_000),
      item('D', 30, 300_000, 0, { hasRecipe: false, zeroCogsLines: 3 }),
    ]
    const ok = buildMenuMatrix(half, 30)
    expect(ok).toMatchObject({ state: 'ok', coverageBps: 5000n })

    const less = buildMenuMatrix([...half, item('E', 1, 1, 0, { hasRecipe: false })], 30)
    expect(less.state).toBe('incomplete_costs')
    // 300 000 / 600 001 shows as 50,00 % but is just under half: the guard compares exactly.
    expect(less.coverageBps).toBe(5000n)
  })

  it('needs at least 3 cost-complete items', () => {
    const m = buildMenuMatrix(four.slice(0, 2), 30)
    expect(m.state).toBe('too_few_items')
    expect(m.items.every((i) => i.quadrant === null)).toBe(true)
  })

  it('reports no_sales for a category that sold nothing', () => {
    expect(buildMenuMatrix([], 30)).toEqual({
      state: 'no_sales',
      coverageBps: null,
      avgMarginPerPortion: null,
      items: [],
      incomplete: [],
    })
  })
})
