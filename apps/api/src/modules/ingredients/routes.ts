import { trimName } from '../../http/input.js'
import { IdParams, NoContent } from '../../http/schemas.js'
import { requireAuth } from '../../http/require-auth.js'
import type { App } from '../../http/types.js'
import {
  CreateIngredientBody,
  IngredientListResponse,
  IngredientResponse,
  MovementListQuery,
  MovementListResponse,
  UpdateIngredientBody,
} from './schemas.js'
import * as service from './service.js'

const MANAGE = { auth: 'user', permission: 'menu.manage' } as const
// Stock levels are visible to every role (PRD §6); costs only to the owner.
const VIEW = { auth: 'user', permission: 'stock.view' } as const
const tags = ['ingredients']

export const ingredientRoutes = async (app: App) => {
  app.get(
    '/ingredients',
    { config: VIEW, schema: { tags, response: { 200: IngredientListResponse } } },
    async (request) => request.tenantTx((trx) => service.listIngredients(trx, requireAuth(request.auth))),
  )

  app.get(
    '/ingredients/:id',
    { config: VIEW, schema: { tags, params: IdParams, response: { 200: IngredientResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.getIngredient(trx, requireAuth(request.auth), request.params.id)),
  )

  app.post(
    '/ingredients',
    { config: MANAGE, schema: { tags, body: CreateIngredientBody, response: { 201: IngredientResponse } } },
    async (request, reply) => {
      const body = trimName(request.body)
      const ingredient = await request.tenantTx((trx) =>
        service.createIngredient(trx, requireAuth(request.auth), {
          ...body,
          ...(body.purchase_unit_name ? { purchase_unit_name: body.purchase_unit_name.trim() } : {}),
        }),
      )
      return reply.status(201).send(ingredient)
    },
  )

  app.patch(
    '/ingredients/:id',
    {
      config: MANAGE,
      schema: { tags, params: IdParams, body: UpdateIngredientBody, response: { 200: IngredientResponse } },
    },
    async (request) => {
      const body = trimName(request.body)
      return request.tenantTx((trx) =>
        service.updateIngredient(trx, requireAuth(request.auth), request.params.id, {
          ...body,
          ...(body.purchase_unit_name ? { purchase_unit_name: body.purchase_unit_name.trim() } : {}),
        }),
      )
    },
  )

  app.delete(
    '/ingredients/:id',
    { config: MANAGE, schema: { tags, params: IdParams, response: { 204: NoContent } } },
    async (request, reply) => {
      await request.tenantTx((trx) =>
        service.archiveIngredient(trx, requireAuth(request.auth), request.params.id),
      )
      return reply.status(204).send(null)
    },
  )

  app.get(
    '/ingredients/:id/movements',
    {
      config: VIEW,
      schema: {
        tags,
        params: IdParams,
        querystring: MovementListQuery,
        response: { 200: MovementListResponse },
      },
    },
    async (request) =>
      request.tenantTx((trx) =>
        service.listMovements(trx, requireAuth(request.auth), request.params.id, request.query),
      ),
  )
}
