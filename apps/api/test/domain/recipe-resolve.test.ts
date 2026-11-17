// SPEC §7.1 examples, which must be unit tests.
import { describe, expect, it } from 'vitest'
import { parseQty } from '../../src/domain/decimal.js'
import { resolveIngredients, type Effect, type SelectedOption } from '../../src/domain/recipe-resolve.js'

const q = parseQty
const kopiSusu = [
  { ingredientId: 'beans', qty: q('18') },
  { ingredientId: 'milk', qty: q('150') },
  { ingredientId: 'aren', qty: q('20') },
  { ingredientId: 'cup12', qty: q('1') },
  { ingredientId: 'lid', qty: q('1') },
]

const option = (groupSort: number, optionSort: number, ...effects: Effect[]): SelectedOption => ({
  groupSort,
  optionSort,
  effects,
})
const add = (ingredientId: string, qty: string, sort = 0): Effect => ({
  effect: 'add',
  ingredientId,
  qty: q(qty),
  sort,
})
const remove = (ingredientId: string, sort = 0): Effect => ({ effect: 'remove', ingredientId, sort })
const replace = (target: string, ingredientId: string, qty: string | null = null, sort = 0): Effect => ({
  effect: 'replace',
  ingredientId,
  targetIngredientId: target,
  qty: qty === null ? null : q(qty),
  sort,
})

// Groups in the demo menu order: Ukuran (0), Gula (1), Susu (3), Tambahan (4).
const large = option(0, 1, replace('cup12', 'cup16'), add('milk', '50', 1))
const lessSugar = option(1, 1, replace('aren', 'aren', '10'))
const oatMilk = option(3, 1, replace('milk', 'oat'))
const extraShot = option(4, 0, add('beans', '18'))
const vanilla = option(4, 1, add('vanilla', '15'))

const plain = (m: Map<string, bigint>): Record<string, bigint> =>
  Object.fromEntries([...m].sort(([a], [b]) => a.localeCompare(b)))

describe('resolveIngredients (SPEC §7.1)', () => {
  it('Kopi Susu + Oat + Extra shot + Less sugar ×2', () => {
    const result = resolveIngredients(kopiSusu, [oatMilk, extraShot, lessSugar], 2)
    expect(plain(result)).toEqual({
      aren: q('20'),
      beans: q('72'),
      cup12: q('2'),
      lid: q('2'),
      oat: q('300'),
    })
  })

  it('Kopi Susu + Large + Oat ×1: the Large milk add is redirected to oat', () => {
    const result = resolveIngredients(kopiSusu, [large, oatMilk], 1)
    expect(plain(result)).toEqual({
      aren: q('20'),
      beans: q('18'),
      cup16: q('1'),
      lid: q('1'),
      oat: q('200'),
    })
    expect(result.has('milk')).toBe(false)
  })

  it('an add whose ingredient was not replaced is simply added', () => {
    const result = resolveIngredients(kopiSusu, [vanilla], 1)
    expect(result.get('vanilla')).toBe(q('15'))
    expect(result.get('milk')).toBe(q('150'))
  })

  it('an item with no recipe resolves to an empty map', () => {
    expect(resolveIngredients([], [], 3).size).toBe(0)
  })

  it('an item with no recipe still takes add effects', () => {
    expect(plain(resolveIngredients([], [vanilla], 2))).toEqual({ vanilla: q('30') })
  })

  it('removes run before replaces and adds, regardless of option order', () => {
    const noMilk = option(3, 2, remove('milk'))
    const result = resolveIngredients(kopiSusu, [large, noMilk], 1)
    // Milk removed first; Large's replace on cup still applies; its milk add has no
    // applied replace to follow, so it adds plain milk.
    expect(result.get('milk')).toBe(q('50'))
    expect(result.get('cup16')).toBe(q('1'))
  })

  it('a replace whose target is absent is a no-op', () => {
    const result = resolveIngredients([{ ingredientId: 'tea', qty: q('5') }], [oatMilk], 1)
    expect(plain(result)).toEqual({ tea: q('5') })
  })

  it('replace into an ingredient already present adds to it', () => {
    const result = resolveIngredients(
      [
        { ingredientId: 'milk', qty: q('100') },
        { ingredientId: 'oat', qty: q('20') },
      ],
      [oatMilk],
      1,
    )
    expect(plain(result)).toEqual({ oat: q('120') })
  })

  it('applies options in (group sort, option sort) and effects in sort order', () => {
    // Two replaces on the same target: the first in sort order wins, the second is a no-op.
    const first = option(0, 0, replace('milk', 'oat'))
    const second = option(0, 1, replace('milk', 'soy'))
    expect(plain(resolveIngredients(kopiSusu.slice(1, 2), [second, first], 1))).toEqual({ oat: q('150') })
  })

  it('keeps fractional quantities exact', () => {
    const result = resolveIngredients([{ ingredientId: 'syrup', qty: q('7.5') }], [], 3)
    expect(result.get('syrup')).toBe(q('22.5'))
  })

  it('rejects a non-positive or fractional qty', () => {
    expect(() => resolveIngredients(kopiSusu, [], 0)).toThrow()
    expect(() => resolveIngredients(kopiSusu, [], 1.5)).toThrow()
  })
})
