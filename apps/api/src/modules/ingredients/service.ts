import type { AuthContext } from '../../auth/context.js'
import { can } from '../../auth/permissions.js'
import type { Tx } from '../../db/with-tenant.js'
import { formatCost, formatQty, parseCost, parseQty } from '../../domain/decimal.js'
import { decodeCursor, encodeCursor, pageLimit } from '../../http/cursor.js'
import { apiError } from '../../http/errors.js'
import { iso, money } from '../../http/serialize.js'
import * as q from './queries.js'

type BaseUnit = 'g' | 'ml' | 'pcs'
type MovementType = 'sale' | 'void_return' | 'stock_in' | 'waste' | 'count_adjust'

const qty = (value: string) => formatQty(parseQty(value))
const cost = (value: string) => formatCost(parseCost(value))

export const toIngredientResponse = (row: q.IngredientRow, withCosts: boolean) => {
  const stock = parseQty(row.stock_qty)
  const threshold = parseQty(row.low_stock_threshold)
  return {
    id: row.id,
    name: row.name,
    base_unit: row.base_unit as BaseUnit,
    stock_qty: formatQty(stock),
    low_stock_threshold: formatQty(threshold),
    purchase_unit_name: row.purchase_unit_name,
    purchase_unit_size: row.purchase_unit_size === null ? null : qty(row.purchase_unit_size),
    is_low: threshold > 0n && stock <= threshold,
    archived: row.archived_at !== null,
    ...(withCosts ? { avg_cost: cost(row.avg_cost) } : {}),
  }
}

type PurchaseUnit = { purchase_unit_name?: string | null; purchase_unit_size?: string | null }

// Purchase unit name and size come as a pair (both set or both null).
const assertPurchaseUnit = (next: { name: string | null; size: string | null }) => {
  if ((next.name === null) !== (next.size === null)) {
    throw apiError('VALIDATION', { field: 'purchase_unit_size', problem: 'name_and_size_together' })
  }
  if (next.size !== null && parseQty(next.size) <= 0n) {
    throw apiError('VALIDATION', { field: 'purchase_unit_size', problem: 'must_be_positive' })
  }
}

const load = async (trx: Tx, auth: AuthContext, id: string, opts: { live: boolean }) => {
  const row = await q.findIngredient(trx, auth.tenantId, id, { forUpdate: opts.live })
  if (!row || (opts.live && row.archived_at !== null)) throw apiError('NOT_FOUND')
  return row
}

export const listIngredients = async (trx: Tx, auth: AuthContext) => ({
  ingredients: (await q.listIngredients(trx, auth.tenantId)).map((r) =>
    toIngredientResponse(r, can(auth.role, 'costs.view')),
  ),
})

export const getIngredient = async (trx: Tx, auth: AuthContext, id: string) =>
  toIngredientResponse(await load(trx, auth, id, { live: false }), can(auth.role, 'costs.view'))

export const createIngredient = async (
  trx: Tx,
  auth: AuthContext,
  input: PurchaseUnit & { name: string; base_unit: BaseUnit; low_stock_threshold?: string },
) => {
  assertPurchaseUnit({ name: input.purchase_unit_name ?? null, size: input.purchase_unit_size ?? null })
  const row = await q.insertIngredient(trx, { ...input, tenant_id: auth.tenantId })
  return toIngredientResponse(row, can(auth.role, 'costs.view'))
}

export const updateIngredient = async (
  trx: Tx,
  auth: AuthContext,
  id: string,
  patch: PurchaseUnit & { name?: string; low_stock_threshold?: string },
) => {
  const current = await load(trx, auth, id, { live: true })
  assertPurchaseUnit({
    name: patch.purchase_unit_name !== undefined ? patch.purchase_unit_name : current.purchase_unit_name,
    size: patch.purchase_unit_size !== undefined ? patch.purchase_unit_size : current.purchase_unit_size,
  })
  const row =
    Object.keys(patch).length > 0 ? await q.updateIngredient(trx, auth.tenantId, id, patch) : current
  return toIngredientResponse(row, can(auth.role, 'costs.view'))
}

// D-029: archived ingredients still deduct through existing recipes (SPEC §7.2)
// but can't be added to new recipes or effects.
export const archiveIngredient = async (trx: Tx, auth: AuthContext, id: string) => {
  await load(trx, auth, id, { live: true })
  await q.updateIngredient(trx, auth.tenantId, id, { archived_at: new Date() })
}

export const listMovements = async (
  trx: Tx,
  auth: AuthContext,
  id: string,
  page: { cursor?: string; limit?: string },
) => {
  await load(trx, auth, id, { live: false })
  const limit = pageLimit(page.limit)
  const rows = await q.listMovements(trx, auth.tenantId, id, decodeCursor(page.cursor), limit + 1)
  const withCosts = can(auth.role, 'costs.view')
  const pageRows = rows.slice(0, limit)
  const last = pageRows[pageRows.length - 1]
  return {
    movements: pageRows.map((m) => ({
      id: m.id,
      type: m.type as MovementType,
      qty_delta: qty(m.qty_delta),
      balance_after: qty(m.balance_after),
      order_id: m.order_id,
      reason: m.reason,
      counted_qty: m.counted_qty === null ? null : qty(m.counted_qty),
      created_by: { id: m.user_id, name: m.user_name },
      created_at: iso(m.created_at),
      ...(withCosts
        ? { unit_cost: cost(m.unit_cost), total_cost: m.total_cost === null ? null : money(m.total_cost) }
        : {}),
    })),
    next_cursor:
      rows.length > limit && last ? encodeCursor({ createdAt: last.cursor_at, id: last.id }) : null,
  }
}
