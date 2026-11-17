import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import swagger from '@fastify/swagger'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import type { Config } from './config/env.js'
import type { Database } from './db/kysely.js'
import { errorHandler, notFoundHandler } from './http/error-handler.js'
import type { App } from './http/types.js'
import { registerAuth } from './auth/plugin.js'
import { createLimiters, type Limiters } from './http/rate-limit.js'
import { authRoutes } from './modules/auth/routes.js'
import { deviceRoutes } from './modules/devices/routes.js'
import { healthRoutes } from './modules/health/routes.js'
import { userRoutes } from './modules/users/routes.js'
import { categoryRoutes } from './modules/categories/routes.js'
import { discountRoutes } from './modules/discounts/routes.js'
import { ingredientRoutes } from './modules/ingredients/routes.js'
import { itemRoutes } from './modules/items/routes.js'
import { modifierRoutes } from './modules/modifiers/routes.js'
import { recipeRoutes } from './modules/recipes/routes.js'
import { settingsRoutes } from './modules/settings/routes.js'

export type AppDeps = { config: Config; db: Database; limiters?: Limiters }

// Never log secrets: PINs, passwords and tokens are redacted wherever they appear.
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-device-token"]',
  'res.headers["set-cookie"]',
]

export const buildApp = async ({ config, db, limiters = createLimiters() }: AppDeps): Promise<App> => {
  const app = Fastify({
    logger: config.nodeEnv === 'test' ? false : { level: config.logLevel, redact: REDACT },
    trustProxy: config.trustProxy,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id']
      return typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID()
    },
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: false } },
  }).withTypeProvider<TypeBoxTypeProvider>()

  // `db` is deliberately not decorated on the app: route handlers reach the
  // database only through request.tenantTx (SPEC §3.3). The raw handle is passed
  // explicitly to the auth layer and the pre-tenant routes (login, pairing).
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  await app.register(helmet, {
    hsts: config.nodeEnv === 'production',
    contentSecurityPolicy: false,
  })
  await app.register(cors, { origin: config.dashboardOrigin, credentials: true })
  await app.register(cookie)
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'ZuruPOS API', version: '1.0.0' },
      components: {
        securitySchemes: {
          dashboardSession: { type: 'apiKey', in: 'cookie', name: 'zuru_session' },
          deviceToken: { type: 'apiKey', in: 'header', name: 'X-Device-Token' },
          staffToken: { type: 'http', scheme: 'bearer' },
        },
      },
    },
  })

  registerAuth(app, { db, config })

  await app.register(healthRoutes, { db })
  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { db, config, limiters })
      await v1.register(deviceRoutes, { db, limiters })
      await v1.register(userRoutes, { config })
      await v1.register(settingsRoutes)
      await v1.register(categoryRoutes)
      await v1.register(itemRoutes)
      await v1.register(modifierRoutes)
      await v1.register(ingredientRoutes)
      await v1.register(recipeRoutes)
      await v1.register(discountRoutes)
    },
    { prefix: '/v1' },
  )

  return app
}
