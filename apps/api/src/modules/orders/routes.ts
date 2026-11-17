import type { Config } from '../../config/env.js'
import { apiError } from '../../http/errors.js'
import { requireAuth } from '../../http/require-auth.js'
import { IdParams } from '../../http/schemas.js'
import type { App } from '../../http/types.js'
import { getOrder, loadOrder, today } from './present.js'
import { CreateOrderBody, OrderResponse, TodayResponse, VoidBody } from './schemas.js'
import { createOrder, DuplicateOrder } from './service.js'
import * as q from './queries.js'
import { voidOrder } from './void.js'

const tags = ['orders']

export const orderRoutes = async (app: App, { config }: { config: Config }) => {
  // 201 for a new order; 200 with the stored order for a repeated client_order_id.
  app.post(
    '/orders',
    {
      config: { auth: 'user', permission: 'orders.create' },
      schema: { tags, body: CreateOrderBody, response: { 200: OrderResponse, 201: OrderResponse } },
    },
    async (request, reply) => {
      const auth = requireAuth(request.auth)
      const result = await request
        .tenantTx((trx) => createOrder(trx, config, auth, request.body))
        .catch(async (err: unknown) => {
          if (!(err instanceof DuplicateOrder)) throw err
          // Lost the race to a retry of the same order: return the one that won.
          return request.tenantTx(async (trx) => {
            const existing = await q.findOrderIdByClientId(trx, auth.tenantId, err.clientOrderId)
            if (!existing) throw apiError('CONFLICT')
            return { created: false, order: await loadOrder(trx, auth, existing.id) }
          })
        })
      return reply.status(result.created ? 201 : 200).send(result.order)
    },
  )

  app.get(
    '/orders/today',
    {
      config: { auth: 'user', permission: 'orders.view_today' },
      schema: { tags, response: { 200: TodayResponse } },
    },
    async (request) => request.tenantTx((trx) => today(trx, requireAuth(request.auth))),
  )

  // Owners read any order; cashiers and managers today's (for reprint and void).
  app.get(
    '/orders/:id',
    {
      config: { auth: 'user', permission: ['orders.view_all', 'orders.reprint_receipt'] },
      schema: { tags, params: IdParams, response: { 200: OrderResponse } },
    },
    async (request) => request.tenantTx((trx) => getOrder(trx, requireAuth(request.auth), request.params.id)),
  )

  app.post(
    '/orders/:id/void',
    {
      config: { auth: 'user', permission: ['orders.void', 'orders.void_with_approval'] },
      schema: { tags, params: IdParams, body: VoidBody, response: { 200: OrderResponse } },
    },
    async (request) => {
      const result = await request.tenantTx((trx) =>
        voidOrder(trx, config, requireAuth(request.auth), request.params.id, request.body),
      )
      if (!result.ok) {
        if (result.pin.reason === 'locked') {
          throw apiError('PIN_LOCKED', { locked_until: result.pin.lockedUntil.toISOString() })
        }
        throw apiError('FORBIDDEN', { reason: 'approval_invalid_pin' })
      }
      return result.order
    },
  )
}
