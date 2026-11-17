import { assertPinAllowed } from '../../auth/policy-errors.js'
import { hashSecret } from '../../auth/secrets.js'
import type { Config } from '../../config/env.js'
import { requireAuth } from '../../http/require-auth.js'
import { IdParams, NoContent } from '../../http/schemas.js'
import type { App } from '../../http/types.js'
import { CreateUserBody, ResetPinBody, UpdateUserBody, UserListResponse, UserResponse } from './schemas.js'
import * as service from './service.js'

const MANAGE = { auth: 'user', permission: 'users.manage' } as const

export const userRoutes = async (app: App, { config }: { config: Config }) => {
  app.get(
    '/users',
    { config: MANAGE, schema: { tags: ['users'], response: { 200: UserListResponse } } },
    async (request) => request.tenantTx((trx) => service.listUsers(trx, requireAuth(request.auth))),
  )

  app.post(
    '/users',
    { config: MANAGE, schema: { tags: ['users'], body: CreateUserBody, response: { 201: UserResponse } } },
    async (request, reply) => {
      const auth = requireAuth(request.auth)
      assertPinAllowed(request.body.pin)
      const pinHash = await hashSecret(request.body.pin)
      const user = await request.tenantTx((trx) =>
        service.createUser(trx, config, auth, {
          name: request.body.name.trim(),
          role: request.body.role,
          email: request.body.email,
          pinHash,
          locale: request.body.locale ?? 'id',
        }),
      )
      return reply.status(201).send(user)
    },
  )

  app.patch(
    '/users/:id',
    {
      config: MANAGE,
      schema: { tags: ['users'], params: IdParams, body: UpdateUserBody, response: { 200: UserResponse } },
    },
    async (request) =>
      request.tenantTx((trx) =>
        service.updateUser(trx, config, requireAuth(request.auth), request.params.id, {
          ...request.body,
          ...(request.body.name !== undefined ? { name: request.body.name.trim() } : {}),
        }),
      ),
  )

  app.post(
    '/users/:id/reset-pin',
    {
      config: MANAGE,
      schema: { tags: ['users'], params: IdParams, body: ResetPinBody, response: { 204: NoContent } },
    },
    async (request, reply) => {
      const auth = requireAuth(request.auth)
      assertPinAllowed(request.body.pin)
      const pinHash = await hashSecret(request.body.pin)
      await request.tenantTx((trx) => service.resetPin(trx, auth, request.params.id, pinHash))
      return reply.status(204).send(null)
    },
  )

  app.post(
    '/users/:id/deactivate',
    { config: MANAGE, schema: { tags: ['users'], params: IdParams, response: { 200: UserResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.deactivateUser(trx, requireAuth(request.auth), request.params.id)),
  )
}
