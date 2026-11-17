import { requireAuth } from '../../http/require-auth.js'
import type { App } from '../../http/types.js'
import { StockInvariantResponse } from './schemas.js'
import * as service from './service.js'

export const adminRoutes = async (app: App) => {
  app.get(
    '/admin/stock-invariant',
    {
      config: { auth: 'user', permission: 'admin.stock_invariant' },
      schema: { tags: ['admin'], response: { 200: StockInvariantResponse } },
    },
    async (request) => request.tenantTx((trx) => service.stockInvariant(trx, requireAuth(request.auth))),
  )
}
