import { requireAuth } from '../../http/require-auth.js'
import { NoContent } from '../../http/schemas.js'
import type { App } from '../../http/types.js'
import { BootstrapQuery, BootstrapResponse } from './schemas.js'
import { bootstrap } from './service.js'

export const bootstrapRoutes = async (app: App) => {
  // The app's menu cache. `?since=<menu_version>` → 304 when nothing changed.
  app.get(
    '/device/bootstrap',
    {
      config: { auth: 'user', permission: 'orders.create' },
      schema: {
        tags: ['device'],
        querystring: BootstrapQuery,
        response: { 200: BootstrapResponse, 304: NoContent },
      },
    },
    async (request, reply) => {
      const result = await request.tenantTx((trx) => bootstrap(trx, requireAuth(request.auth)))
      if (request.query.since === result.menu_version) return reply.status(304).send(null)
      return result
    },
  )
}
