import { writeAudit } from '../../audit/audit.js'
import { STAFF_SESSION_TTL_MS } from '../../auth/constants.js'
import type { AuthContext, DeviceContext } from '../../auth/context.js'
import { verifyCredentials } from '../../auth/credentials.js'
import { can, isRole, type Role } from '../../auth/permissions.js'
import { verifyPinWithLockout } from '../../auth/pin-check.js'
import { findActiveUser, insertSession, revokeDeviceSessions, revokeSession } from '../../auth/queries.js'
import { generateToken } from '../../auth/tokens.js'
import type { Database } from '../../db/kysely.js'
import { withTenant, type Tx } from '../../db/with-tenant.js'
import { apiError } from '../../http/errors.js'
import { iso, isoOrNull } from '../../http/serialize.js'
import * as q from './queries.js'

// Pairing (SPEC §5.2): owner/manager credentials create a device and return its
// token exactly once. Only the SHA-256 hash is stored.
export const pairDevice = async (
  db: Database,
  input: { email: string; password: string; deviceName: string; appVersion: string | undefined },
) => {
  const account = await verifyCredentials(db, input.email, input.password)
  if (!isRole(account.role) || !can(account.role, 'devices.pair')) throw apiError('FORBIDDEN')
  return withTenant(db, account.tenant_id, async (trx) => {
    const { token, hash } = generateToken()
    const device = await q.insertDevice(trx, {
      tenant_id: account.tenant_id,
      name: input.deviceName,
      token_hash: hash,
      paired_by_user_id: account.user_id,
      app_version: input.appVersion ?? null,
    })
    await writeAudit(trx, {
      tenantId: account.tenant_id,
      actorUserId: account.user_id,
      action: 'device.pair',
      entityType: 'device',
      entityId: device.id,
      data: { name: device.name },
    })
    const shop = await q.findTenantName(trx, account.tenant_id)
    return { device_token: token, device, shop }
  })
}

export const listDevices = async (trx: Tx, auth: AuthContext) => {
  const rows = await q.listDevices(trx, auth.tenantId)
  return {
    devices: rows.map((r) => ({
      id: r.id,
      name: r.name,
      paired_by: { id: r.paired_by_id, name: r.paired_by_name },
      app_version: r.app_version,
      last_seen_at: isoOrNull(r.last_seen_at),
      revoked_at: isoOrNull(r.revoked_at),
      created_at: iso(r.created_at),
    })),
  }
}

// Revoking a device ends all of its staff sessions immediately (SPEC §5.2).
// D-048: only from a staff session on that device; a dashboard session has no device.
export const unpairCurrentDevice = async (trx: Tx, auth: AuthContext) => {
  if (auth.deviceId === null) throw apiError('FORBIDDEN')
  await revokeDevice(trx, auth, auth.deviceId)
}

export const revokeDevice = async (trx: Tx, auth: AuthContext, deviceId: string) => {
  const revoked = await q.revokeDevice(trx, auth.tenantId, deviceId)
  if (!revoked) {
    if (!(await q.deviceExists(trx, auth.tenantId, deviceId))) throw apiError('NOT_FOUND')
    return
  }
  await revokeDeviceSessions(trx, auth.tenantId, deviceId)
  await writeAudit(trx, {
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: 'device.revoke',
    entityType: 'device',
    entityId: deviceId,
  })
}

export const listStaff = async (trx: Tx, device: DeviceContext) => ({
  staff: (await q.listActiveStaff(trx, device.tenantId)).flatMap((u) =>
    isRole(u.role) ? [{ id: u.id, name: u.name, role: u.role }] : [],
  ),
})

export type PinLoginResult =
  | { ok: true; staff_token: string; expires_at: string; user: { id: string; name: string; role: Role } }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'locked'; lockedUntil: Date }

// Returns failures instead of throwing so the caller's transaction COMMITS the
// failure count (a thrown error would roll the lockout back).
export const pinLogin = async (
  trx: Tx,
  device: DeviceContext,
  input: { userId: string; pin: string },
): Promise<PinLoginResult> => {
  const user = await findActiveUser(trx, device.tenantId, input.userId)
  if (!user || !isRole(user.role)) throw apiError('NOT_FOUND')
  const check = await verifyPinWithLockout(trx, {
    tenantId: device.tenantId,
    userId: user.id,
    deviceId: device.deviceId,
    pinHash: user.pin_hash,
    pin: input.pin,
  })
  if (!check.ok) return check
  const { token, hash } = generateToken()
  const session = await insertSession(trx, {
    tenant_id: device.tenantId,
    user_id: user.id,
    kind: 'staff',
    device_id: device.deviceId,
    token_hash: hash,
    expires_at: new Date(Date.now() + STAFF_SESSION_TTL_MS),
  })
  return {
    ok: true,
    staff_token: token,
    expires_at: iso(session.expires_at),
    user: { id: user.id, name: user.name, role: user.role },
  }
}

export const endStaffSession = async (trx: Tx, auth: AuthContext) => {
  if (auth.kind !== 'staff') throw apiError('FORBIDDEN')
  await revokeSession(trx, auth.tenantId, auth.sessionId)
}

export const heartbeat = async (trx: Tx, device: DeviceContext, appVersion: string | undefined) => {
  await q.touchDevice(trx, device.tenantId, device.deviceId, appVersion)
  return { server_time: iso(new Date()) }
}
