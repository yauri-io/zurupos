// Tenant-scoped session and user queries used by the auth layer. Every query
// also filters on tenant_id (defence in depth, SPEC §3.3).
import type { Tx } from '../db/with-tenant.js'

export const findActiveUser = (trx: Tx, tenantId: string, userId: string) =>
  trx
    .selectFrom('users')
    .select(['id', 'tenant_id', 'name', 'role', 'email', 'locale', 'is_active', 'pin_hash', 'password_hash'])
    .where('tenant_id', '=', tenantId)
    .where('id', '=', userId)
    .where('is_active', '=', true)
    .executeTakeFirst()

export const insertSession = (
  trx: Tx,
  row: {
    tenant_id: string
    user_id: string
    kind: 'dashboard' | 'staff'
    device_id: string | null
    token_hash: Buffer
    expires_at: Date
  },
) => trx.insertInto('sessions').values(row).returning(['id', 'expires_at']).executeTakeFirstOrThrow()

export const touchSession = (trx: Tx, tenantId: string, sessionId: string, expiresAt: Date | null) =>
  trx
    .updateTable('sessions')
    .set(expiresAt ? { last_used_at: new Date(), expires_at: expiresAt } : { last_used_at: new Date() })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', sessionId)
    .execute()

export const sessionLastUsed = (trx: Tx, tenantId: string, sessionId: string) =>
  trx
    .selectFrom('sessions')
    .select(['last_used_at'])
    .where('tenant_id', '=', tenantId)
    .where('id', '=', sessionId)
    .executeTakeFirst()

export const revokeSession = (trx: Tx, tenantId: string, sessionId: string) =>
  trx
    .updateTable('sessions')
    .set({ revoked_at: new Date() })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', sessionId)
    .where('revoked_at', 'is', null)
    .execute()

export const revokeUserSessions = (
  trx: Tx,
  tenantId: string,
  userId: string,
  kind?: 'dashboard' | 'staff',
) => {
  let q = trx
    .updateTable('sessions')
    .set({ revoked_at: new Date() })
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
  if (kind) q = q.where('kind', '=', kind)
  return q.execute()
}

export const revokeDeviceSessions = (trx: Tx, tenantId: string, deviceId: string) =>
  trx
    .updateTable('sessions')
    .set({ revoked_at: new Date() })
    .where('tenant_id', '=', tenantId)
    .where('device_id', '=', deviceId)
    .where('revoked_at', 'is', null)
    .execute()
