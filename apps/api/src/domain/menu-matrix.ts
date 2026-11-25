// Menu matrix (SPEC §12.5, D-073): popularity × margin per portion within one
// category, with items whose cost of goods can't be trusted kept out of it.
// Pure function over per-item aggregates; integers only.
import { divRound } from './decimal.js'

export const MIN_COVERAGE_BPS = 5000n
export const MIN_ITEMS = 3
export const PRICE_STEP = 1000n // suggested price rises in whole Rp 1.000

export type MatrixItemInput = {
  itemId: string
  name: string
  archived: boolean
  qty: bigint
  net: bigint // net sales after the allocated order discount
  cogs: bigint // whole rupiah
  zeroCogsLines: number // lines in range sold with cogs = 0
  hasRecipe: boolean
  uncostedIngredients: readonly string[] // in the recipe or a linked modifier, avg_cost = 0
}

export type Quadrant = 'andalan' | 'naikkan_harga' | 'promosikan' | 'evaluasi'
export type IncompleteReason = 'no_recipe' | 'ingredient_without_cost' | 'sold_without_cost'
export type MatrixState = 'ok' | 'incomplete_costs' | 'too_few_items' | 'no_sales'

export type MatrixItem = {
  itemId: string
  name: string
  archived: boolean
  qty: bigint
  net: bigint
  cogs: bigint
  margin: bigint
  marginPerPortion: bigint
  quadrant: Quadrant | null // null unless the state is `ok`
  suggestedIncrease: bigint | null // naikkan_harga only
  extra30d: bigint | null // naikkan_harga only
}

export type IncompleteItem = {
  itemId: string
  name: string
  archived: boolean
  net: bigint
  reasons: IncompleteReason[]
  ingredients: string[]
}

export type MenuMatrix = {
  state: MatrixState
  coverageBps: bigint | null
  avgMarginPerPortion: bigint | null
  items: MatrixItem[]
  incomplete: IncompleteItem[]
}

const reasonsOf = (i: MatrixItemInput): IncompleteReason[] => [
  ...(i.hasRecipe ? [] : ['no_recipe' as const]),
  ...(i.uncostedIngredients.length > 0 ? ['ingredient_without_cost' as const] : []),
  ...(i.zeroCogsLines > 0 ? ['sold_without_cost' as const] : []),
]

const ORDER: Quadrant[] = ['andalan', 'naikkan_harga', 'promosikan', 'evaluasi']
const byNet = (a: { net: bigint; name: string }, b: { net: bigint; name: string }) =>
  a.net === b.net ? a.name.localeCompare(b.name) : a.net > b.net ? -1 : 1

export const buildMenuMatrix = (input: readonly MatrixItemInput[], daysInRange: number): MenuMatrix => {
  if (!Number.isInteger(daysInRange) || daysInRange <= 0) throw new Error('buildMenuMatrix: bad range')
  const sold = input.filter((i) => i.qty > 0n)
  const incomplete = sold
    .map((i) => ({ i, reasons: reasonsOf(i) }))
    .filter((x) => x.reasons.length > 0)
    .map(({ i, reasons }): IncompleteItem => ({
      itemId: i.itemId,
      name: i.name,
      archived: i.archived,
      net: i.net,
      reasons,
      ingredients: [...i.uncostedIngredients],
    }))
    .sort(byNet)
  const included = sold.filter((i) => reasonsOf(i).length === 0)

  const totalNet = sold.reduce((s, i) => s + i.net, 0n)
  const includedNet = included.reduce((s, i) => s + i.net, 0n)
  const coverageBps = totalNet > 0n ? divRound(includedNet * 10_000n, totalNet) : null

  const n = BigInt(included.length)
  const q = included.reduce((s, i) => s + i.qty, 0n)
  const m = included.reduce((s, i) => s + (i.net - i.cogs), 0n)
  const avgMarginPerPortion = q > 0n ? divRound(m, q) : null

  // Compared exactly: 49,999 % must not round up past the 50 % guard.
  const lowCoverage = totalNet > 0n && includedNet * 10_000n < totalNet * MIN_COVERAGE_BPS
  const state: MatrixState =
    sold.length === 0
      ? 'no_sales'
      : lowCoverage
        ? 'incomplete_costs'
        : included.length < MIN_ITEMS
          ? 'too_few_items'
          : 'ok'

  const items = included
    .map((i): MatrixItem => {
      const margin = i.net - i.cogs
      const marginPerPortion = divRound(margin, i.qty)
      let quadrant: Quadrant | null = null
      let suggestedIncrease: bigint | null = null
      let extra30d: bigint | null = null
      if (state === 'ok' && avgMarginPerPortion !== null) {
        const popular = i.qty * n * 10n >= q * 7n // share ≥ 70% of an equal share
        const high = margin * q >= m * i.qty // margin per portion ≥ weighted average
        quadrant = popular ? (high ? 'andalan' : 'naikkan_harga') : high ? 'promosikan' : 'evaluasi'
        if (quadrant === 'naikkan_harga') {
          const gap = avgMarginPerPortion > marginPerPortion ? avgMarginPerPortion - marginPerPortion : 0n
          const steps = (gap + PRICE_STEP - 1n) / PRICE_STEP
          suggestedIncrease = (steps > 0n ? steps : 1n) * PRICE_STEP
          extra30d = divRound(suggestedIncrease * i.qty * 30n, BigInt(daysInRange))
        }
      }
      return {
        itemId: i.itemId,
        name: i.name,
        archived: i.archived,
        qty: i.qty,
        net: i.net,
        cogs: i.cogs,
        margin,
        marginPerPortion,
        quadrant,
        suggestedIncrease,
        extra30d,
      }
    })
    .sort((a, b) =>
      a.quadrant === b.quadrant
        ? byNet(a, b)
        : ORDER.indexOf(a.quadrant ?? 'evaluasi') - ORDER.indexOf(b.quadrant ?? 'evaluasi'),
    )

  return { state, coverageBps, avgMarginPerPortion, items, incomplete }
}
