import type { FastifyRequest } from 'fastify'
import { clearSessionCookie, setSessionCookie } from '../../auth/cookies.js'
import { assertPasswordAllowed, assertPinAllowed } from '../../auth/policy-errors.js'
import { hashSecret } from '../../auth/secrets.js'
import type { Config } from '../../config/env.js'
import type { Database } from '../../db/kysely.js'
import { apiError } from '../../http/errors.js'
import type { Limiter, Limiters } from '../../http/rate-limit.js'
import { NoContent } from '../../http/schemas.js'
import type { App } from '../../http/types.js'
import { ForgotBody, LoginBody, MeResponse, SignupBody, TokenPasswordBody } from './schemas.js'
import * as service from './service.js'

type Deps = { db: Database; config: Config; limiters: Limiters }

const limit = (limiter: Limiter, key: string) => {
  if (!limiter.hit(key)) throw apiError('RATE_LIMITED')
}

const ipOf = (request: FastifyRequest) => request.ip

export const authRoutes = async (app: App, { db, config, limiters }: Deps) => {
  app.post(
    '/auth/signup',
    { config: { auth: 'none' }, schema: { tags: ['auth'], body: SignupBody, response: { 201: NoContent } } },
    async (request, reply) => {
      if (!config.signupEnabled) throw apiError('NOT_FOUND')
      limit(limiters.signupByIp, ipOf(request))
      const body = request.body
      assertPasswordAllowed(body.password)
      assertPinAllowed(body.pin)
      const [passwordHash, pinHash] = await Promise.all([hashSecret(body.password), hashSecret(body.pin)])
      const { token } = await service.signup(db, {
        shopName: body.shop_name.trim(),
        name: body.name.trim(),
        email: body.email,
        passwordHash,
        pinHash,
        locale: body.locale ?? 'id',
      })
      setSessionCookie(reply, config, token)
      return reply.status(201).send(null)
    },
  )

  app.post(
    '/auth/login',
    { config: { auth: 'none' }, schema: { tags: ['auth'], body: LoginBody, response: { 204: NoContent } } },
    async (request, reply) => {
      limit(limiters.loginByIp, ipOf(request))
      limit(limiters.loginByEmail, request.body.email.toLowerCase())
      const { token } = await service.login(db, request.body.email, request.body.password)
      setSessionCookie(reply, config, token)
      return reply.status(204).send(null)
    },
  )

  app.post(
    '/auth/logout',
    { config: { auth: 'dashboard' }, schema: { tags: ['auth'], response: { 204: NoContent } } },
    async (request, reply) => {
      const auth = request.auth
      if (auth) await request.tenantTx((trx) => service.logout(trx, auth))
      clearSessionCookie(reply, config)
      return reply.status(204).send(null)
    },
  )

  app.get(
    '/auth/me',
    { config: { auth: 'user' }, schema: { tags: ['auth'], response: { 200: MeResponse } } },
    async (request) => {
      const auth = request.auth
      if (!auth) throw apiError('UNAUTHENTICATED')
      return request.tenantTx((trx) => service.me(trx, auth))
    },
  )

  app.post(
    '/auth/password/forgot',
    { config: { auth: 'none' }, schema: { tags: ['auth'], body: ForgotBody, response: { 204: NoContent } } },
    async (request, reply) => {
      limit(limiters.resetByIp, ipOf(request))
      limit(limiters.resetByEmail, request.body.email.toLowerCase())
      await service.forgotPassword(db, config, request.body.email)
      return reply.status(204).send(null)
    },
  )

  const redeem =
    (purpose: 'reset' | 'invite') =>
    async (request: FastifyRequest<{ Body: { token: string; password: string } }>) => {
      limit(limiters.resetByIp, ipOf(request))
      assertPasswordAllowed(request.body.password)
      const passwordHash = await hashSecret(request.body.password)
      await service.redeemPasswordToken(db, { token: request.body.token, passwordHash, purpose })
    }

  app.post(
    '/auth/password/reset',
    {
      config: { auth: 'none' },
      schema: { tags: ['auth'], body: TokenPasswordBody, response: { 204: NoContent } },
    },
    async (request, reply) => {
      await redeem('reset')(request)
      return reply.status(204).send(null)
    },
  )

  app.post(
    '/auth/invite/accept',
    {
      config: { auth: 'none' },
      schema: { tags: ['auth'], body: TokenPasswordBody, response: { 204: NoContent } },
    },
    async (request, reply) => {
      await redeem('invite')(request)
      return reply.status(204).send(null)
    },
  )
}
