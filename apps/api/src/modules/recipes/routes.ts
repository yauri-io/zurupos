import { IdParams } from '../../http/schemas.js'
import { requireAuth } from '../../http/require-auth.js'
import type { App } from '../../http/types.js'
import {
  EffectsResponse,
  PreviewBody,
  PreviewResponse,
  PutEffectsBody,
  PutRecipeBody,
  RecipeResponse,
} from './schemas.js'
import * as service from './service.js'

const MANAGE = { auth: 'user', permission: 'menu.manage' } as const
const tags = ['recipes']

export const recipeRoutes = async (app: App) => {
  app.get(
    '/items/:id/recipe',
    { config: MANAGE, schema: { tags, params: IdParams, response: { 200: RecipeResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.getRecipe(trx, requireAuth(request.auth), request.params.id)),
  )

  app.put(
    '/items/:id/recipe',
    {
      config: MANAGE,
      schema: { tags, params: IdParams, body: PutRecipeBody, response: { 200: RecipeResponse } },
    },
    async (request) =>
      request.tenantTx((trx) =>
        service.putRecipe(trx, requireAuth(request.auth), request.params.id, request.body.lines),
      ),
  )

  app.get(
    '/modifier-options/:id/effects',
    { config: MANAGE, schema: { tags, params: IdParams, response: { 200: EffectsResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.getEffects(trx, requireAuth(request.auth), request.params.id)),
  )

  app.put(
    '/modifier-options/:id/effects',
    {
      config: MANAGE,
      schema: { tags, params: IdParams, body: PutEffectsBody, response: { 200: EffectsResponse } },
    },
    async (request) =>
      request.tenantTx((trx) =>
        service.putEffects(trx, requireAuth(request.auth), request.params.id, request.body.effects),
      ),
  )

  app.post(
    '/recipes/preview',
    { config: MANAGE, schema: { tags, body: PreviewBody, response: { 200: PreviewResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.preview(trx, requireAuth(request.auth), request.body)),
  )
}
