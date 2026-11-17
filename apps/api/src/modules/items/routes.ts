import { trimName } from '../../http/input.js'
import { IdParams, NoContent } from '../../http/schemas.js'
import { requireAuth } from '../../http/require-auth.js'
import type { App } from '../../http/types.js'
import {
  AvailabilityBody,
  CreateItemBody,
  ItemGroupsBody,
  ItemListQuery,
  ItemListResponse,
  ItemResponse,
  UpdateItemBody,
} from './schemas.js'
import * as service from './service.js'

const MANAGE = { auth: 'user', permission: 'menu.manage' } as const
const tags = ['menu']

export const itemRoutes = async (app: App) => {
  app.get(
    '/items',
    { config: MANAGE, schema: { tags, querystring: ItemListQuery, response: { 200: ItemListResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.listItems(trx, requireAuth(request.auth), request.query.category_id)),
  )

  app.get(
    '/items/:id',
    { config: MANAGE, schema: { tags, params: IdParams, response: { 200: ItemResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.getItem(trx, requireAuth(request.auth), request.params.id)),
  )

  app.post(
    '/items',
    { config: MANAGE, schema: { tags, body: CreateItemBody, response: { 201: ItemResponse } } },
    async (request, reply) => {
      const item = await request.tenantTx((trx) =>
        service.createItem(trx, requireAuth(request.auth), trimName(request.body)),
      )
      return reply.status(201).send(item)
    },
  )

  app.patch(
    '/items/:id',
    {
      config: MANAGE,
      schema: { tags, params: IdParams, body: UpdateItemBody, response: { 200: ItemResponse } },
    },
    async (request) =>
      request.tenantTx((trx) =>
        service.updateItem(trx, requireAuth(request.auth), request.params.id, trimName(request.body)),
      ),
  )

  // Sold-out toggle: cashiers may flip it from the counter (PRD §6).
  app.patch(
    '/items/:id/availability',
    {
      config: { auth: 'user', permission: 'menu.availability' },
      schema: { tags, params: IdParams, body: AvailabilityBody, response: { 200: ItemResponse } },
    },
    async (request) =>
      request.tenantTx((trx) =>
        service.setAvailability(trx, requireAuth(request.auth), request.params.id, request.body.is_available),
      ),
  )

  app.put(
    '/items/:id/modifier-groups',
    {
      config: MANAGE,
      schema: { tags, params: IdParams, body: ItemGroupsBody, response: { 200: ItemResponse } },
    },
    async (request) =>
      request.tenantTx((trx) =>
        service.setModifierGroups(trx, requireAuth(request.auth), request.params.id, request.body.group_ids),
      ),
  )

  app.delete(
    '/items/:id',
    { config: MANAGE, schema: { tags, params: IdParams, response: { 204: NoContent } } },
    async (request, reply) => {
      await request.tenantTx((trx) => service.archiveItem(trx, requireAuth(request.auth), request.params.id))
      return reply.status(204).send(null)
    },
  )
}
