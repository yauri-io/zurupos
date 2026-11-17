// Append-only audit log (SPEC §4.1). Always written inside the business transaction.
import type { Tx } from '../db/with-tenant.js'

export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.role_change'
  | 'user.deactivate'
  | 'user.pin_reset'
  | 'user.password_reset'
  | 'user.invite_accept'
  | 'device.pair'
  | 'device.revoke'
  | 'tenant.signup'

export const writeAudit = (
  trx: Tx,
  entry: {
    tenantId: string
    actorUserId: string
    action: AuditAction
    entityType: string
    entityId: string | null
    data?: Record<string, unknown>
  },
) =>
  trx
    .insertInto('audit_log')
    .values({
      tenant_id: entry.tenantId,
      actor_user_id: entry.actorUserId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      data: JSON.stringify(entry.data ?? {}),
    })
    .execute()
