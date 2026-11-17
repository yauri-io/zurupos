import { requireAuth } from '../../http/require-auth.js'
import type { App } from '../../http/types.js'
import {
  CategoriesResponse,
  DailyResponse,
  HourlyResponse,
  ItemsResponse,
  MarginResponse,
  PaymentsResponse,
  RangeQuery,
  StockValueResponse,
  SummaryResponse,
  VoidsResponse,
} from './schemas.js'
import * as service from './service.js'

const tags = ['reports']
const OWNER = { auth: 'user', permission: 'reports.view' } as const

export const reportRoutes = async (app: App) => {
  app.get(
    '/reports/summary',
    { config: OWNER, schema: { tags, querystring: RangeQuery, response: { 200: SummaryResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.summary(trx, requireAuth(request.auth), request.query)),
  )
  app.get(
    '/reports/daily',
    { config: OWNER, schema: { tags, querystring: RangeQuery, response: { 200: DailyResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.daily(trx, requireAuth(request.auth), request.query)),
  )
  app.get(
    '/reports/hourly',
    { config: OWNER, schema: { tags, querystring: RangeQuery, response: { 200: HourlyResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.hourly(trx, requireAuth(request.auth), request.query)),
  )
  app.get(
    '/reports/items',
    { config: OWNER, schema: { tags, querystring: RangeQuery, response: { 200: ItemsResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.items(trx, requireAuth(request.auth), request.query)),
  )
  app.get(
    '/reports/categories',
    { config: OWNER, schema: { tags, querystring: RangeQuery, response: { 200: CategoriesResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.categories(trx, requireAuth(request.auth), request.query)),
  )
  app.get(
    '/reports/payments',
    { config: OWNER, schema: { tags, querystring: RangeQuery, response: { 200: PaymentsResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.payments(trx, requireAuth(request.auth), request.query)),
  )
  app.get(
    '/reports/margin',
    {
      config: { auth: 'user', permission: 'costs.view' },
      schema: { tags, querystring: RangeQuery, response: { 200: MarginResponse } },
    },
    async (request) =>
      request.tenantTx((trx) => service.margin(trx, requireAuth(request.auth), request.query)),
  )
  app.get(
    '/reports/voids',
    { config: OWNER, schema: { tags, querystring: RangeQuery, response: { 200: VoidsResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.voids(trx, requireAuth(request.auth), request.query)),
  )
  app.get(
    '/reports/stock-value',
    {
      config: { auth: 'user', permission: 'costs.view' },
      schema: { tags, response: { 200: StockValueResponse } },
    },
    async (request) => request.tenantTx((trx) => service.stockValue(trx, requireAuth(request.auth))),
  )
}
