import { trimName } from '../../http/input.js'
import { IdParams, NoContent } from '../../http/schemas.js'
import { requireAuth } from '../../http/require-auth.js'
import type { App } from '../../http/types.js'
import {
  CreateGroupBody,
  CreateOptionBody,
  GroupListResponse,
  GroupResponse,
  OptionResponse,
  UpdateGroupBody,
  UpdateOptionBody,
} from './schemas.js'
import * as service from './service.js'

const MANAGE = { auth: 'user', permission: 'menu.manage' } as const
const tags = ['menu']

export const modifierRoutes = async (app: App) => {
  app.get(
    '/modifier-groups',
    { config: MANAGE, schema: { tags, response: { 200: GroupListResponse } } },
    async (request) => request.tenantTx((trx) => service.listGroups(trx, requireAuth(request.auth))),
  )

  app.post(
    '/modifier-groups',
    { config: MANAGE, schema: { tags, body: CreateGroupBody, response: { 201: GroupResponse } } },
    async (request, reply) => {
      const group = await request.tenantTx((trx) =>
        service.createGroup(trx, requireAuth(request.auth), trimName(request.body)),
      )
      return reply.status(201).send(group)
    },
  )

  app.patch(
    '/modifier-groups/:id',
    {
      config: MANAGE,
      schema: { tags, params: IdParams, body: UpdateGroupBody, response: { 200: GroupResponse } },
    },
    async (request) =>
      request.tenantTx((trx) =>
        service.updateGroup(trx, requireAuth(request.auth), request.params.id, trimName(request.body)),
      ),
  )

  app.delete(
    '/modifier-groups/:id',
    { config: MANAGE, schema: { tags, params: IdParams, response: { 204: NoContent } } },
    async (request, reply) => {
      await request.tenantTx((trx) => service.archiveGroup(trx, requireAuth(request.auth), request.params.id))
      return reply.status(204).send(null)
    },
  )

  app.post(
    '/modifier-options',
    { config: MANAGE, schema: { tags, body: CreateOptionBody, response: { 201: OptionResponse } } },
    async (request, reply) => {
      const option = await request.tenantTx((trx) =>
        service.createOption(trx, requireAuth(request.auth), trimName(request.body)),
      )
      return reply.status(201).send(option)
    },
  )

  app.patch(
    '/modifier-options/:id',
    {
      config: MANAGE,
      schema: { tags, params: IdParams, body: UpdateOptionBody, response: { 200: OptionResponse } },
    },
    async (request) =>
      request.tenantTx((trx) =>
        service.updateOption(trx, requireAuth(request.auth), request.params.id, trimName(request.body)),
      ),
  )

  app.delete(
    '/modifier-options/:id',
    { config: MANAGE, schema: { tags, params: IdParams, response: { 204: NoContent } } },
    async (request, reply) => {
      await request.tenantTx((trx) =>
        service.archiveOption(trx, requireAuth(request.auth), request.params.id),
      )
      return reply.status(204).send(null)
    },
  )
}
