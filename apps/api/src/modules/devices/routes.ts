import type { Database } from '../../db/kysely.js'
import { apiError } from '../../http/errors.js'
import { requireAuth } from '../../http/require-auth.js'
import type { Limiters } from '../../http/rate-limit.js'
import { IdParams, NoContent } from '../../http/schemas.js'
import type { App } from '../../http/types.js'
import {
  DeviceListResponse,
  HeartbeatBody,
  HeartbeatResponse,
  PairBody,
  PairResponse,
  PinLoginBody,
  PinLoginResponse,
  StaffListResponse,
} from './schemas.js'
import * as service from './service.js'

type Deps = { db: Database; limiters: Limiters }

export const deviceRoutes = async (app: App, { db, limiters }: Deps) => {
  app.post(
    '/devices/pair',
    {
      config: { auth: 'none' },
      schema: { tags: ['devices'], body: PairBody, response: { 201: PairResponse } },
    },
    async (request, reply) => {
      if (!limiters.loginByIp.hit(request.ip)) throw apiError('RATE_LIMITED')
      if (!limiters.loginByEmail.hit(request.body.email.toLowerCase())) throw apiError('RATE_LIMITED')
      const result = await service.pairDevice(db, {
        email: request.body.email,
        password: request.body.password,
        deviceName: request.body.device_name.trim(),
        appVersion: request.body.app_version,
      })
      return reply.status(201).send(result)
    },
  )

  app.get(
    '/devices',
    {
      config: { auth: 'user', permission: 'devices.manage' },
      schema: { tags: ['devices'], response: { 200: DeviceListResponse } },
    },
    async (request) => request.tenantTx((trx) => service.listDevices(trx, requireAuth(request.auth))),
  )

  app.post(
    '/devices/:id/revoke',
    {
      config: { auth: 'user', permission: 'devices.manage' },
      schema: { tags: ['devices'], params: IdParams, response: { 204: NoContent } },
    },
    async (request, reply) => {
      await request.tenantTx((trx) => service.revokeDevice(trx, requireAuth(request.auth), request.params.id))
      return reply.status(204).send(null)
    },
  )

  // D-048: owner/manager unpairs the device in hand (e.g. to pair it to another shop).
  app.delete(
    '/device',
    {
      config: { auth: 'user', permission: 'devices.pair' },
      schema: { tags: ['device'], response: { 204: NoContent } },
    },
    async (request, reply) => {
      await request.tenantTx((trx) => service.unpairCurrentDevice(trx, requireAuth(request.auth)))
      return reply.status(204).send(null)
    },
  )

  app.get(
    '/device/staff',
    { config: { auth: 'device' }, schema: { tags: ['device'], response: { 200: StaffListResponse } } },
    async (request) => request.tenantTx((trx) => service.listStaff(trx, requireDevice(request.device))),
  )

  app.post(
    '/device/sessions',
    {
      config: { auth: 'device' },
      schema: { tags: ['device'], body: PinLoginBody, response: { 201: PinLoginResponse } },
    },
    async (request, reply) => {
      const device = requireDevice(request.device)
      if (!limiters.pinByDevice.hit(device.deviceId)) throw apiError('RATE_LIMITED')
      const result = await request.tenantTx((trx) =>
        service.pinLogin(trx, device, { userId: request.body.user_id, pin: request.body.pin }),
      )
      if (!result.ok) {
        if (result.reason === 'locked')
          throw apiError('PIN_LOCKED', { locked_until: result.lockedUntil.toISOString() })
        throw apiError('UNAUTHENTICATED', { reason: 'invalid_pin' })
      }
      return reply
        .status(201)
        .send({ staff_token: result.staff_token, expires_at: result.expires_at, user: result.user })
    },
  )

  app.delete(
    '/device/sessions/current',
    { config: { auth: 'user' }, schema: { tags: ['device'], response: { 204: NoContent } } },
    async (request, reply) => {
      await request.tenantTx((trx) => service.endStaffSession(trx, requireAuth(request.auth)))
      return reply.status(204).send(null)
    },
  )

  app.post(
    '/device/heartbeat',
    {
      config: { auth: 'device' },
      schema: { tags: ['device'], body: HeartbeatBody, response: { 200: HeartbeatResponse } },
    },
    async (request) =>
      request.tenantTx((trx) =>
        service.heartbeat(trx, requireDevice(request.device), request.body.app_version),
      ),
  )
}

const requireDevice = <T>(device: T | null): T => {
  if (!device) throw apiError('UNAUTHENTICATED')
  return device
}
