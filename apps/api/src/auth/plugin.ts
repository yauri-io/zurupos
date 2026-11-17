// Authentication, CSRF and permission guard for every route (SPEC §5).
import type { FastifyRequest } from 'fastify'
import type { Config } from '../config/env.js'
import type { Database } from '../db/kysely.js'
import { withTenant, type Tx } from '../db/with-tenant.js'
import { apiError } from '../http/errors.js'
import type { App } from '../http/types.js'
import { DEVICE_TOKEN_HEADER, SESSION_COOKIE } from './constants.js'
import type { AuthMode } from './context.js'
import { can, type Permission } from './permissions.js'
import { bearerToken, resolveDashboardSession, resolveDevice, resolveStaffSession } from './resolve.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Cookie-authenticated (browser) requests that change state must carry the
// custom header (forces a CORS preflight) and, if sent, a same-origin Origin.
const checkCsrf = (request: FastifyRequest, config: Config) => {
  if (SAFE_METHODS.has(request.method)) return
  if (request.headers[DEVICE_TOKEN_HEADER] !== undefined) return
  if (request.headers['x-requested-with'] !== 'zuru') throw apiError('FORBIDDEN', { reason: 'csrf' })
  const origin = request.headers.origin
  if (origin !== undefined && origin !== config.dashboardOrigin)
    throw apiError('FORBIDDEN', { reason: 'csrf' })
}

const authenticate = async (request: FastifyRequest, db: Database, mode: AuthMode) => {
  if (mode === 'none') return
  const deviceHeader = request.headers[DEVICE_TOKEN_HEADER]

  if (mode === 'device') {
    request.device = await resolveDevice(db, deviceHeader)
    return
  }
  if (deviceHeader !== undefined) {
    if (mode === 'dashboard') throw apiError('UNAUTHENTICATED')
    request.device = await resolveDevice(db, deviceHeader)
    request.auth = await resolveStaffSession(db, request.device, bearerToken(request.headers.authorization))
    return
  }
  request.auth = await resolveDashboardSession(db, request.cookies[SESSION_COOKIE])
}

export const registerAuth = (app: App, { db, config }: { db: Database; config: Config }) => {
  app.decorateRequest('auth', null)
  app.decorateRequest('device', null)
  app.decorateRequest('tenantTx', function <
    T,
  >(this: FastifyRequest, fn: (trx: Tx) => Promise<T>): Promise<T> {
    // The tenant comes only from the verified session or device token.
    const tenantId = this.auth?.tenantId ?? this.device?.tenantId
    if (!tenantId) return Promise.reject(apiError('UNAUTHENTICATED'))
    return withTenant(db, tenantId, fn)
  })

  app.addHook('onRequest', async (request) => {
    // Unknown routes fall through to the 404 handler without auth.
    if (!request.routeOptions.url) return
    const mode = request.routeOptions.config.auth ?? 'user'
    checkCsrf(request, config)
    await authenticate(request, db, mode)
    const permission = request.routeOptions.config.permission
    if (permission !== undefined) {
      if (!request.auth) throw apiError('FORBIDDEN')
      const anyOf: readonly Permission[] = typeof permission === 'string' ? [permission] : permission
      const role = request.auth.role
      if (!anyOf.some((p) => can(role, p))) throw apiError('FORBIDDEN')
    }
  })
}
