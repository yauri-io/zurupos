// SPEC §7.4: stock-in, waste and stock count. Each locks the ingredient rows in id
// order, writes stock + movement together (src/stock/ledger.ts), then runs the
// low-stock check (§8), all in the request's tenant transaction.
import { writeAudit } from '../../audit/audit.js'
import type { AuthContext } from '../../auth/context.js'
import { can } from '../../auth/permissions.js'
import type { Config } from '../../config/env.js'
import type { Tx } from '../../db/with-tenant.js'
import { unitCostOf, weightedAverageCost } from '../../domain/avg-cost.js'
import { formatQty, parseQty, QTY_SCALE } from '../../domain/decimal.js'
import { apiError } from '../../http/errors.js'
import { applyMovement, lockIngredients, type LockedIngredient } from '../../stock/ledger.js'
import { checkLowStock } from '../../stock/low-stock.js'
import { toIngredientResponse } from '../ingredients/service.js'
import * as q from './queries.js'

const QTY_UNIT = 10n ** BigInt(QTY_SCALE)

const lockLive = async (trx: Tx, auth: AuthContext, ids: string[]) => {
  const locked = await lockIngredients(trx, auth.tenantId, ids)
  if (ids.some((id) => !locked.has(id))) throw apiError('NOT_FOUND')
  const rows = await q.liveIngredientRows(trx, auth.tenantId, ids)
  if (rows.some((r) => r.archived_at !== null)) throw apiError('NOT_FOUND')
  return locked
}

const result = async (trx: Tx, auth: AuthContext, ids: string[]) => ({
  ingredients: (await q.liveIngredientRows(trx, auth.tenantId, ids)).map((r) =>
    toIngredientResponse(r, can(auth.role, 'costs.view')),
  ),
})

const positive = (value: string, field: string): bigint => {
  const qty = parseQty(value)
  if (qty <= 0n) throw apiError('VALIDATION', { field, problem: 'must_be_positive' })
  return qty
}

export const stockIn = async (
  trx: Tx,
  config: Config,
  auth: AuthContext,
  input: { ingredient_id: string; qty?: string; purchase_qty?: string; total_cost: number },
) => {
  if ((input.qty === undefined) === (input.purchase_qty === undefined)) {
    throw apiError('VALIDATION', { field: 'qty', problem: 'qty_or_purchase_qty' })
  }
  const locked = await lockLive(trx, auth, [input.ingredient_id])
  const ingredient = locked.get(input.ingredient_id) as LockedIngredient
  let qty: bigint
  if (input.purchase_qty !== undefined) {
    const unit = await q.findPurchaseUnit(trx, auth.tenantId, input.ingredient_id)
    if (!unit?.purchase_unit_size) {
      throw apiError('VALIDATION', { field: 'purchase_qty', problem: 'no_purchase_unit' })
    }
    // purchase_qty × size, both in thousandths → back to thousandths. Must stay exact.
    const product = positive(input.purchase_qty, 'purchase_qty') * parseQty(unit.purchase_unit_size)
    if (product % QTY_UNIT !== 0n) {
      throw apiError('VALIDATION', { field: 'purchase_qty', problem: 'too_many_decimals' })
    }
    qty = product / QTY_UNIT
  } else {
    qty = positive(input.qty ?? '', 'qty')
  }
  const totalCost = BigInt(input.total_cost)
  await applyMovement(trx, {
    tenantId: auth.tenantId,
    userId: auth.userId,
    ingredient,
    qtyDelta: qty,
    movement: {
      type: 'stock_in',
      unitCost: unitCostOf(qty, totalCost),
      totalCost,
      newAvgCost: weightedAverageCost({
        stockQty: ingredient.stockQty,
        avgCost: ingredient.avgCost,
        qty,
        totalCost,
      }),
    },
  })
  await checkLowStock(trx, config, auth.tenantId, locked.values())
  return result(trx, auth, [ingredient.id])
}

export const waste = async (
  trx: Tx,
  config: Config,
  auth: AuthContext,
  input: { ingredient_id: string; qty: string; reason: string; note?: string },
) => {
  const qty = positive(input.qty, 'qty')
  const locked = await lockLive(trx, auth, [input.ingredient_id])
  const ingredient = locked.get(input.ingredient_id) as LockedIngredient
  const note = input.note?.trim()
  await applyMovement(trx, {
    tenantId: auth.tenantId,
    userId: auth.userId,
    ingredient,
    qtyDelta: -qty,
    // The reason code first, so reports can group by it; the note after it.
    movement: {
      type: 'waste',
      unitCost: ingredient.avgCost,
      reason: note ? `${input.reason}: ${note}` : input.reason,
    },
  })
  await checkLowStock(trx, config, auth.tenantId, locked.values())
  return result(trx, auth, [ingredient.id])
}

export const count = async (
  trx: Tx,
  config: Config,
  auth: AuthContext,
  input: { counts: { ingredient_id: string; counted_qty: string }[]; note?: string },
) => {
  const ids = input.counts.map((c) => c.ingredient_id)
  if (new Set(ids).size !== ids.length) {
    throw apiError('VALIDATION', { field: 'counts', problem: 'duplicate_ingredient' })
  }
  const locked = await lockLive(trx, auth, ids)
  const note = input.note?.trim() || null
  const adjustments: { ingredient_id: string; from: string; to: string }[] = []
  // Apply in id order, matching the lock order.
  for (const c of [...input.counts].sort((a, b) => (a.ingredient_id < b.ingredient_id ? -1 : 1))) {
    const ingredient = locked.get(c.ingredient_id) as LockedIngredient
    const counted = parseQty(c.counted_qty)
    const delta = counted - ingredient.stockQty
    if (delta === 0n) continue
    adjustments.push({
      ingredient_id: ingredient.id,
      from: formatQty(ingredient.stockQty),
      to: formatQty(counted),
    })
    await applyMovement(trx, {
      tenantId: auth.tenantId,
      userId: auth.userId,
      ingredient,
      qtyDelta: delta,
      movement: { type: 'count_adjust', unitCost: ingredient.avgCost, countedQty: counted, reason: note },
    })
  }
  await checkLowStock(trx, config, auth.tenantId, locked.values())
  // One audit entry for the whole count (SPEC §7.4).
  await writeAudit(trx, {
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: 'stock.count',
    entityType: 'stock_count',
    entityId: null,
    data: { counted: ids.length, adjustments, note },
  })
  return result(trx, auth, ids)
}
