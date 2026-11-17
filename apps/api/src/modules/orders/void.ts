// POST /v1/orders/:id/void — SPEC §7.3 with manager approval (§5.4).
import { writeAudit } from '../../audit/audit.js'
import type { AuthContext } from '../../auth/context.js'
import { can, isRole } from '../../auth/permissions.js'
import { verifyPinWithLockout, type PinResult } from '../../auth/pin-check.js'
import { findActiveUser } from '../../auth/queries.js'
import type { Config } from '../../config/env.js'
import type { Tx } from '../../db/with-tenant.js'
import { parseCost, parseQty } from '../../domain/decimal.js'
import { apiError } from '../../http/errors.js'
import { applyMovement, lockIngredients, type LockedIngredient } from '../../stock/ledger.js'
import { checkLowStock } from '../../stock/low-stock.js'
import { loadOrder } from './present.js'
import * as q from './queries.js'

export type VoidInput = { reason: string; restock: boolean; approval?: { user_id: string; pin: string } }

// A failed approval PIN is returned (not thrown) so the transaction commits and
// the failure counts towards the approver's lockout on this device.
export type VoidResult =
  | { ok: true; order: Awaited<ReturnType<typeof loadOrder>> }
  | { ok: false; pin: Exclude<PinResult, { ok: true }> }

// Who approves: nobody for owner/manager; for a cashier, an active owner/manager
// of the same shop entering their PIN on this device. Single use per request.
const approve = async (trx: Tx, auth: AuthContext, approval: VoidInput['approval']) => {
  if (can(auth.role, 'orders.void')) return { ok: true as const, approverId: null }
  if (!can(auth.role, 'orders.void_with_approval')) throw apiError('FORBIDDEN')
  if (!approval) throw apiError('FORBIDDEN', { reason: 'approval_required' })
  if (!auth.deviceId) throw apiError('FORBIDDEN', { reason: 'approval_needs_device' })
  const approver = await findActiveUser(trx, auth.tenantId, approval.user_id)
  if (!approver) throw apiError('NOT_FOUND')
  if (!isRole(approver.role) || !can(approver.role, 'orders.void') || approver.id === auth.userId) {
    throw apiError('FORBIDDEN', { reason: 'approver_not_allowed' })
  }
  const pin = await verifyPinWithLockout(trx, {
    tenantId: auth.tenantId,
    userId: approver.id,
    deviceId: auth.deviceId,
    pinHash: approver.pin_hash,
    pin: approval.pin,
  })
  return pin.ok ? { ok: true as const, approverId: approver.id } : { ok: false as const, pin }
}

export const voidOrder = async (
  trx: Tx,
  config: Config,
  auth: AuthContext,
  orderId: string,
  input: VoidInput,
): Promise<VoidResult> => {
  // 1. Lock the order; it must be paid.
  const order = await q.findOrder(trx, auth.tenantId, orderId, { forUpdate: true })
  if (!order) throw apiError('NOT_FOUND')
  if (order.status !== 'paid') throw apiError('CONFLICT', { reason: 'not_paid' })

  // 2. Permission and approval.
  const approval = await approve(trx, auth, input.approval)
  if (!approval.ok) return { ok: false, pin: approval.pin }

  // 3. Mark voided.
  const reason = input.reason.trim()
  await q.markVoided(trx, auth.tenantId, orderId, {
    voidedBy: auth.userId,
    approvedBy: approval.approverId,
    reason,
    restock: input.restock,
  })

  // 4. Restock: return each sale movement at its original unit cost; the average
  //    cost is not recalculated on a void return.
  if (input.restock) {
    const sales = await q.saleMovementsOf(trx, auth.tenantId, orderId)
    const locked = await lockIngredients(
      trx,
      auth.tenantId,
      sales.map((m) => m.ingredient_id),
    )
    for (const m of [...sales].sort((a, b) => (a.ingredient_id < b.ingredient_id ? -1 : 1))) {
      await applyMovement(trx, {
        tenantId: auth.tenantId,
        userId: auth.userId,
        ingredient: locked.get(m.ingredient_id) as LockedIngredient,
        qtyDelta: -parseQty(m.qty_delta),
        movement: { type: 'void_return', orderId, unitCost: parseCost(m.unit_cost) },
      })
    }
    // 5. Returned stock may re-arm low-stock alerts.
    await checkLowStock(trx, config, auth.tenantId, locked.values())
  }

  // 6. Audit.
  await writeAudit(trx, {
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: 'order.void',
    entityType: 'order',
    entityId: orderId,
    data: {
      order_number: order.order_number,
      reason,
      restock: input.restock,
      approved_by: approval.approverId,
    },
  })
  return { ok: true, order: await loadOrder(trx, auth, orderId) }
}
