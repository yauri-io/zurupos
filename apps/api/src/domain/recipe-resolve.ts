// SPEC §7.1: which ingredients one order line consumes. Pure; quantities are
// thousandths of the ingredient's base unit (see decimal.ts).

export type RecipeLine = { ingredientId: string; qty: bigint }

export type Effect =
  | { effect: 'add'; ingredientId: string; qty: bigint; sort: number }
  | { effect: 'remove'; ingredientId: string; sort: number }
  | { effect: 'replace'; ingredientId: string; targetIngredientId: string; qty: bigint | null; sort: number }

export type SelectedOption = { groupSort: number; optionSort: number; effects: Effect[] }

const bySort = <T extends { sort: number }>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => a.sort - b.sort)

const orderedEffects = (options: readonly SelectedOption[]): Effect[] =>
  [...options]
    .sort((a, b) => a.groupSort - b.groupSort || a.optionSort - b.optionSort)
    .flatMap((o) => bySort(o.effects))

export const resolveIngredients = (
  recipe: readonly RecipeLine[],
  options: readonly SelectedOption[],
  qty: number,
): Map<string, bigint> => {
  if (!Number.isInteger(qty) || qty < 1) throw new Error('resolveIngredients: qty must be a positive integer')
  const m = new Map<string, bigint>()
  for (const line of recipe) m.set(line.ingredientId, (m.get(line.ingredientId) ?? 0n) + line.qty)

  const effects = orderedEffects(options)
  // target → replacement, for replaces that actually applied in this resolution.
  const replacedBy = new Map<string, string>()

  for (const e of effects) if (e.effect === 'remove') m.delete(e.ingredientId)

  for (const e of effects) {
    if (e.effect !== 'replace') continue
    const current = m.get(e.targetIngredientId)
    if (current === undefined) continue // target absent: no-op
    m.delete(e.targetIngredientId)
    m.set(e.ingredientId, (m.get(e.ingredientId) ?? 0n) + (e.qty ?? current))
    replacedBy.set(e.targetIngredientId, e.ingredientId)
  }

  for (const e of effects) {
    if (e.effect !== 'add') continue
    const ingredientId = replacedBy.get(e.ingredientId) ?? e.ingredientId
    m.set(ingredientId, (m.get(ingredientId) ?? 0n) + e.qty)
  }

  const multiplier = BigInt(qty)
  const result = new Map<string, bigint>()
  for (const [id, value] of m) if (value !== 0n) result.set(id, value * multiplier)
  return result
}
