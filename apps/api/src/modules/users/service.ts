import { writeAudit } from '../../audit/audit.js'
import { INVITE_TTL_MS } from '../../auth/constants.js'
import type { AuthContext } from '../../auth/context.js'
import { isRole } from '../../auth/permissions.js'
import { clearPinLockouts } from '../../auth/pin-check.js'
import { revokeUserSessions } from '../../auth/queries.js'
import { generateToken } from '../../auth/tokens.js'
import type { Config } from '../../config/env.js'
import type { Tx } from '../../db/with-tenant.js'
import { apiError } from '../../http/errors.js'
import { iso, isoOrNull } from '../../http/serialize.js'
import { enqueueEmail } from '../../outbox/enqueue.js'
import { renderManagerInvite } from '../../outbox/templates/manager-invite.js'
import * as q from './queries.js'

type UserRow = Awaited<ReturnType<typeof q.listUsers>>[number]
type StaffRole = 'manager' | 'cashier' | 'employee'

export const toUserResponse = (u: UserRow) => {
  if (!isRole(u.role)) throw new Error(`unexpected role ${u.role}`)
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    email: u.email,
    locale: u.locale === 'en' ? ('en' as const) : ('id' as const),
    is_active: u.is_active,
    has_password: u.password_hash !== null,
    last_login_at: isoOrNull(u.last_login_at),
    created_at: iso(u.created_at),
  }
}

const loadTarget = async (trx: Tx, auth: AuthContext, userId: string) => {
  const user = await q.findUserForUpdate(trx, auth.tenantId, userId)
  if (!user) throw apiError('NOT_FOUND')
  return user
}

// Managers set their own password through a 72 h invite link (PRD F2).
const sendInvite = async (trx: Tx, config: Config, auth: AuthContext, user: UserRow & { email: string }) => {
  const { token, hash } = generateToken()
  await q.insertInvite(trx, {
    tenant_id: auth.tenantId,
    user_id: user.id,
    token_hash: hash,
    expires_at: new Date(Date.now() + INVITE_TTL_MS),
  })
  const shop = await q.findTenantName(trx, auth.tenantId)
  await enqueueEmail(trx, {
    tenantId: auth.tenantId,
    kind: 'manager_invite',
    to: [user.email],
    email: renderManagerInvite({
      locale: user.locale === 'en' ? 'en' : 'id',
      name: user.name,
      shopName: shop.name,
      link: `${config.dashboardUrl}/invite/${encodeURIComponent(token)}`,
    }),
  })
}

const assertEmailForRole = (role: StaffRole, email: string | null | undefined) => {
  if (role === 'manager' && !email)
    throw apiError('VALIDATION', { field: 'email', problem: 'required_for_manager' })
  if (role !== 'manager' && email)
    throw apiError('VALIDATION', { field: 'email', problem: 'only_for_manager' })
}

export const listUsers = async (trx: Tx, auth: AuthContext) => ({
  users: (await q.listUsers(trx, auth.tenantId)).map(toUserResponse),
})

export const createUser = async (
  trx: Tx,
  config: Config,
  auth: AuthContext,
  input: { name: string; role: StaffRole; email: string | undefined; pinHash: string; locale: 'id' | 'en' },
) => {
  assertEmailForRole(input.role, input.email)
  const user = await q.insertUser(trx, {
    tenant_id: auth.tenantId,
    name: input.name,
    role: input.role,
    email: input.email ?? null,
    pin_hash: input.pinHash,
    locale: input.locale,
  })
  if (user.email) await sendInvite(trx, config, auth, { ...user, email: user.email })
  await writeAudit(trx, {
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: 'user.create',
    entityType: 'user',
    entityId: user.id,
    data: { role: user.role, name: user.name },
  })
  return toUserResponse(user)
}

export const updateUser = async (
  trx: Tx,
  config: Config,
  auth: AuthContext,
  userId: string,
  patch: { name?: string; role?: StaffRole; email?: string; locale?: 'id' | 'en' },
) => {
  const current = await loadTarget(trx, auth, userId)
  if (current.role === 'owner' && patch.role !== undefined) {
    throw apiError('VALIDATION', { field: 'role', problem: 'owner_role_fixed' })
  }

  const nextRole = (patch.role ?? current.role) as StaffRole | 'owner'
  const roleChanged = patch.role !== undefined && patch.role !== current.role
  const set: Parameters<typeof q.updateUser>[3] = {}
  if (patch.name !== undefined) set.name = patch.name
  if (patch.locale !== undefined) set.locale = patch.locale

  if (nextRole === 'owner' || nextRole === 'manager') {
    const email = patch.email ?? current.email
    if (nextRole === 'manager') assertEmailForRole('manager', email)
    if (patch.email !== undefined) set.email = patch.email
  } else {
    if (patch.email !== undefined) assertEmailForRole(nextRole, patch.email)
    if (roleChanged) {
      // Losing dashboard access: drop credentials and end dashboard sessions.
      set.email = null
      set.password_hash = null
    }
  }
  if (roleChanged) set.role = nextRole

  const updated = Object.keys(set).length > 0 ? await q.updateUser(trx, auth.tenantId, userId, set) : current
  const emailChanged = set.email !== undefined && set.email !== current.email

  if (roleChanged && current.role === 'manager')
    await revokeUserSessions(trx, auth.tenantId, userId, 'dashboard')
  // A manager without a password yet (new, promoted, or re-addressed invite) gets a fresh invite.
  if (
    updated.role === 'manager' &&
    updated.email &&
    updated.password_hash === null &&
    (roleChanged || emailChanged)
  ) {
    await sendInvite(trx, config, auth, { ...updated, email: updated.email })
  }

  await writeAudit(trx, {
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: roleChanged ? 'user.role_change' : 'user.update',
    entityType: 'user',
    entityId: userId,
    data: roleChanged ? { from: current.role, to: nextRole } : { fields: Object.keys(set) },
  })
  return toUserResponse(updated)
}

export const resetPin = async (trx: Tx, auth: AuthContext, userId: string, pinHash: string) => {
  await loadTarget(trx, auth, userId)
  await q.updateUser(trx, auth.tenantId, userId, { pin_hash: pinHash })
  await clearPinLockouts(trx, auth.tenantId, userId)
  await revokeUserSessions(trx, auth.tenantId, userId, 'staff')
  await writeAudit(trx, {
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: 'user.pin_reset',
    entityType: 'user',
    entityId: userId,
  })
}

// Deactivated users can't sign in anywhere; their history remains (PRD F2).
export const deactivateUser = async (trx: Tx, auth: AuthContext, userId: string) => {
  const current = await loadTarget(trx, auth, userId)
  if (current.role === 'owner')
    throw apiError('VALIDATION', { field: 'id', problem: 'cannot_deactivate_owner' })
  const updated = current.is_active
    ? await q.updateUser(trx, auth.tenantId, userId, { is_active: false })
    : current
  await revokeUserSessions(trx, auth.tenantId, userId)
  if (current.is_active) {
    await writeAudit(trx, {
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: 'user.deactivate',
      entityType: 'user',
      entityId: userId,
    })
  }
  return toUserResponse(updated)
}
