import { trimName } from '../../http/input.js'
import { IdParams, NoContent } from '../../http/schemas.js'
import { requireAuth } from '../../http/require-auth.js'
import type { App } from '../../http/types.js'
import { CategoryListResponse, CategoryResponse, CreateCategoryBody, UpdateCategoryBody } from './schemas.js'
import * as service from './service.js'

const MANAGE = { auth: 'user', permission: 'menu.manage' } as const
const tags = ['menu']

export const categoryRoutes = async (app: App) => {
  app.get(
    '/categories',
    { config: MANAGE, schema: { tags, response: { 200: CategoryListResponse } } },
    async (request) => request.tenantTx((trx) => service.listCategories(trx, requireAuth(request.auth))),
  )

  app.post(
    '/categories',
    { config: MANAGE, schema: { tags, body: CreateCategoryBody, response: { 201: CategoryResponse } } },
    async (request, reply) => {
      const category = await request.tenantTx((trx) =>
        service.createCategory(trx, requireAuth(request.auth), trimName(request.body)),
      )
      return reply.status(201).send(category)
    },
  )

  app.patch(
    '/categories/:id',
    {
      config: MANAGE,
      schema: { tags, params: IdParams, body: UpdateCategoryBody, response: { 200: CategoryResponse } },
    },
    async (request) =>
      request.tenantTx((trx) =>
        service.updateCategory(trx, requireAuth(request.auth), request.params.id, trimName(request.body)),
      ),
  )

  app.delete(
    '/categories/:id',
    { config: MANAGE, schema: { tags, params: IdParams, response: { 204: NoContent } } },
    async (request, reply) => {
      await request.tenantTx((trx) =>
        service.archiveCategory(trx, requireAuth(request.auth), request.params.id),
      )
      return reply.status(204).send(null)
    },
  )
}
