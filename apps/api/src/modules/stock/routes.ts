import type { Config } from '../../config/env.js'
import { requireAuth } from '../../http/require-auth.js'
import type { App } from '../../http/types.js'
import { CountBody, StockInBody, StockResultResponse, WasteBody } from './schemas.js'
import * as service from './service.js'

const ADJUST = { auth: 'user', permission: 'stock.adjust' } as const
const tags = ['stock']

export const stockRoutes = async (app: App, { config }: { config: Config }) => {
  app.post(
    '/stock/in',
    { config: ADJUST, schema: { tags, body: StockInBody, response: { 200: StockResultResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.stockIn(trx, config, requireAuth(request.auth), request.body)),
  )

  app.post(
    '/stock/waste',
    { config: ADJUST, schema: { tags, body: WasteBody, response: { 200: StockResultResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.waste(trx, config, requireAuth(request.auth), request.body)),
  )

  app.post(
    '/stock/count',
    { config: ADJUST, schema: { tags, body: CountBody, response: { 200: StockResultResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.count(trx, config, requireAuth(request.auth), request.body)),
  )
}
