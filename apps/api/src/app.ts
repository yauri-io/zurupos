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
import { healthRoutes } from './modules/health/routes.js'

declare module 'fastify' {
  interface FastifyInstance {
    config: Config
    db: Database
  }
}

export type AppDeps = { config: Config; db: Database }

// Never log secrets: PINs, passwords and tokens are redacted wherever they appear.
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-device-token"]',
  'res.headers["set-cookie"]',
]

export const buildApp = async ({ config, db }: AppDeps): Promise<App> => {
  const app = Fastify({
    logger: config.nodeEnv === 'test' ? false : { level: config.logLevel, redact: REDACT },
    trustProxy: config.trustProxy,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id']
      return typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID()
    },
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: false } },
  }).withTypeProvider<TypeBoxTypeProvider>()

  app.decorate('config', config)
  app.decorate('db', db)
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
    },
  })

  await app.register(healthRoutes)

  return app
}
