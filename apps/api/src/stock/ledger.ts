// The only code that changes ingredients.stock_qty (CLAUDE.md rule 4): every change
// is written together with its stock_movements row, in the caller's transaction.
// Rows are locked in ascending id order so concurrent writers can't deadlock.
import type { Tx } from '../db/with-tenant.js'
import { formatCost, formatQty, parseCost, parseQty } from '../domain/decimal.js'

export type LockedIngredient = {
  id: string
  name: string
  baseUnit: string
  stockQty: bigint
  avgCost: bigint
  threshold: bigint
  alertedAt: Date | null
}

export const lockIngredients = async (
  trx: Tx,
  tenantId: string,
  ids: readonly string[],
): Promise<Map<string, LockedIngredient>> => {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await trx
    .selectFrom('ingredients')
    .select([
      'id',
      'name',
      'base_unit',
      'stock_qty',
      'avg_cost',
      'low_stock_threshold',
      'low_stock_alerted_at',
    ])
    .where('tenant_id', '=', tenantId)
    .where('id', 'in', unique)
    .orderBy('id')
    .forUpdate()
    .execute()
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        baseUnit: r.base_unit,
        stockQty: parseQty(r.stock_qty),
        avgCost: parseCost(r.avg_cost),
        threshold: parseQty(r.low_stock_threshold),
        alertedAt: r.low_stock_alerted_at,
      },
    ]),
  )
}

export type Movement =
  | { type: 'sale' | 'void_return'; orderId: string; unitCost: bigint }
  | { type: 'stock_in'; unitCost: bigint; totalCost: bigint; newAvgCost: bigint }
  | { type: 'waste'; unitCost: bigint; reason: string }
  | { type: 'count_adjust'; unitCost: bigint; countedQty: bigint; reason: string | null }

// Applies qtyDelta to a locked ingredient and records the movement. Mutates the
// locked snapshot so later steps (low-stock check, cogs) see the new values.
export const applyMovement = async (
  trx: Tx,
  input: {
    tenantId: string
    userId: string
    ingredient: LockedIngredient
    qtyDelta: bigint
    movement: Movement
  },
) => {
  const { ingredient, movement } = input
  if (input.qtyDelta === 0n) throw new Error('applyMovement: zero delta')
  const balance = ingredient.stockQty + input.qtyDelta
  const newAvg = movement.type === 'stock_in' ? movement.newAvgCost : ingredient.avgCost

  await trx
    .updateTable('ingredients')
    .set({ stock_qty: formatQty(balance), avg_cost: formatCost(newAvg) })
    .where('tenant_id', '=', input.tenantId)
    .where('id', '=', ingredient.id)
    .execute()
  await trx
    .insertInto('stock_movements')
    .values({
      tenant_id: input.tenantId,
      ingredient_id: ingredient.id,
      type: movement.type,
      qty_delta: formatQty(input.qtyDelta),
      unit_cost: formatCost(movement.unitCost),
      total_cost: movement.type === 'stock_in' ? movement.totalCost : null,
      balance_after: formatQty(balance),
      order_id: movement.type === 'sale' || movement.type === 'void_return' ? movement.orderId : null,
      reason: movement.type === 'waste' || movement.type === 'count_adjust' ? movement.reason : null,
      counted_qty: movement.type === 'count_adjust' ? formatQty(movement.countedQty) : null,
      created_by_user_id: input.userId,
    })
    .execute()

  ingredient.stockQty = balance
  ingredient.avgCost = newAvg
}
