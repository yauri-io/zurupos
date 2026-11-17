// SPEC §7.4 weighted average cost, in fixed point (decimal.ts):
// quantities in thousandths, costs in ten-thousandths of a rupiah, money in rupiah.
import { divHalfUp } from './decimal.js'

const QTY_UNIT = 1000n
const COST_UNIT = 10_000n

// new_avg = (max(stock, 0) × avg + total_cost) / (max(stock, 0) + qty), 4 dp half-up.
export const weightedAverageCost = (input: {
  stockQty: bigint
  avgCost: bigint
  qty: bigint
  totalCost: bigint
}): bigint => {
  if (input.qty <= 0n) throw new Error('weightedAverageCost: qty must be positive')
  if (input.totalCost < 0n || input.avgCost < 0n) throw new Error('weightedAverageCost: negative cost')
  const onHand = input.stockQty > 0n ? input.stockQty : 0n
  // Numerator at scale 10^-7 (qty 10^-3 × cost 10^-4); denominator at 10^-3.
  const numerator = onHand * input.avgCost + input.totalCost * QTY_UNIT * COST_UNIT
  return divHalfUp(numerator, onHand + input.qty)
}

// Cost per base unit of one purchase: total_cost / qty, 4 dp half-up.
export const unitCostOf = (qty: bigint, totalCost: bigint): bigint =>
  divHalfUp(totalCost * QTY_UNIT * COST_UNIT, qty)

// qty × unit cost, at cost scale (4 dp), half-up. Used for line COGS.
export const costOf = (qty: bigint, unitCost: bigint): bigint => divHalfUp(qty * unitCost, QTY_UNIT)

// Cost-scale amount → whole rupiah, half-up (orders.cogs_total, stock value).
export const toRupiah = (cost: bigint): bigint => divHalfUp(cost, COST_UNIT)
