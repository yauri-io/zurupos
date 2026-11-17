// PIN verification with per-(user, device) lockout (SPEC §5.3, §5.4). Shared by
// staff PIN login and manager approval. The caller must COMMIT the transaction
// even when the result is a failure, or the failure count would be lost.
import { sql } from 'kysely'
import type { Tx } from '../db/with-tenant.js'
import { PIN_LOCK_MS, PIN_MAX_FAILURES } from './constants.js'
import { verifySecret } from './secrets.js'

export type PinResult =
  { ok: true } | { ok: false; reason: 'invalid' } | { ok: false; reason: 'locked'; lockedUntil: Date }

export const verifyPinWithLockout = async (
  trx: Tx,
  input: { tenantId: string; userId: string; deviceId: string; pinHash: string; pin: string },
): Promise<PinResult> => {
  const { tenantId, userId, deviceId } = input
  await trx
    .insertInto('pin_attempts')
    .values({ tenant_id: tenantId, user_id: userId, device_id: deviceId })
    .onConflict((oc) => oc.columns(['user_id', 'device_id']).doNothing())
    .execute()
  // Row lock serialises concurrent attempts for the same user on the same device.
  const attempt = await trx
    .selectFrom('pin_attempts')
    .select(['id', 'failed_count', 'locked_until'])
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .where('device_id', '=', deviceId)
    .forUpdate()
    .executeTakeFirstOrThrow()

  const now = new Date()
  if (attempt.locked_until && attempt.locked_until > now) {
    return { ok: false, reason: 'locked', lockedUntil: attempt.locked_until }
  }

  if (await verifySecret(input.pinHash, input.pin)) {
    await trx
      .updateTable('pin_attempts')
      .set({ failed_count: 0, locked_until: null })
      .where('id', '=', attempt.id)
      .execute()
    return { ok: true }
  }

  const failures = attempt.failed_count + 1
  if (failures >= PIN_MAX_FAILURES) {
    const lockedUntil = new Date(now.getTime() + PIN_LOCK_MS)
    await trx
      .updateTable('pin_attempts')
      .set({ failed_count: 0, locked_until: lockedUntil })
      .where('id', '=', attempt.id)
      .execute()
    return { ok: false, reason: 'locked', lockedUntil }
  }
  await trx
    .updateTable('pin_attempts')
    .set({ failed_count: sql<number>`failed_count + 1`, locked_until: null })
    .where('id', '=', attempt.id)
    .execute()
  return { ok: false, reason: 'invalid' }
}

export const clearPinLockouts = (trx: Tx, tenantId: string, userId: string) =>
  trx
    .updateTable('pin_attempts')
    .set({ failed_count: 0, locked_until: null })
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .execute()
