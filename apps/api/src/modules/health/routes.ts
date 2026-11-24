import { Type } from 'typebox'
import type { Database } from '../../db/kysely.js'
import type { App } from '../../http/types.js'
import { pingDb } from './queries.js'

const HealthResponse = Type.Object({
  status: Type.Literal('ok'),
  db: Type.Literal('ok'),
  version: Type.String(),
})

export const healthRoutes = async (app: App, { db, version }: { db: Database; version: string }) => {
  app.get(
    '/healthz',
    { config: { auth: 'none' }, schema: { hide: true, response: { 200: HealthResponse } } },
    async () => {
      await pingDb(db)
      return { status: 'ok' as const, db: 'ok' as const, version }
    },
  )
}
