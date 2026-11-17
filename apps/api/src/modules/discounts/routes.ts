import { trimName } from '../../http/input.js'
import { IdParams, NoContent } from '../../http/schemas.js'
import { requireAuth } from '../../http/require-auth.js'
import type { App } from '../../http/types.js'
import { CreateDiscountBody, DiscountListResponse, DiscountResponse, UpdateDiscountBody } from './schemas.js'
import * as service from './service.js'

const MANAGE = { auth: 'user', permission: 'menu.manage' } as const
const tags = ['discounts']

export const discountRoutes = async (app: App) => {
  app.get(
    '/discounts',
    { config: MANAGE, schema: { tags, response: { 200: DiscountListResponse } } },
    async (request) => request.tenantTx((trx) => service.listDiscounts(trx, requireAuth(request.auth))),
  )

  app.post(
    '/discounts',
    { config: MANAGE, schema: { tags, body: CreateDiscountBody, response: { 201: DiscountResponse } } },
    async (request, reply) => {
      const discount = await request.tenantTx((trx) =>
        service.createDiscount(trx, requireAuth(request.auth), trimName(request.body)),
      )
      return reply.status(201).send(discount)
    },
  )

  app.patch(
    '/discounts/:id',
    {
      config: MANAGE,
      schema: { tags, params: IdParams, body: UpdateDiscountBody, response: { 200: DiscountResponse } },
    },
    async (request) =>
      request.tenantTx((trx) =>
        service.updateDiscount(trx, requireAuth(request.auth), request.params.id, trimName(request.body)),
      ),
  )

  app.delete(
    '/discounts/:id',
    { config: MANAGE, schema: { tags, params: IdParams, response: { 204: NoContent } } },
    async (request, reply) => {
      await request.tenantTx((trx) =>
        service.archiveDiscount(trx, requireAuth(request.auth), request.params.id),
      )
      return reply.status(204).send(null)
    },
  )
}
