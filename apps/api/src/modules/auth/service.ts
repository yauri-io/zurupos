import { randomUUID } from 'node:crypto'
import { writeAudit } from '../../audit/audit.js'
import { DASHBOARD_SESSION_TTL_MS, PASSWORD_RESET_TTL_MS } from '../../auth/constants.js'
import type { AuthContext } from '../../auth/context.js'
import { verifyCredentials } from '../../auth/credentials.js'
import { findLoginByEmail, findPasswordReset } from '../../auth/lookups.js'
import { can, isRole, permissionsFor } from '../../auth/permissions.js'
import { findActiveUser, insertSession, revokeSession, revokeUserSessions } from '../../auth/queries.js'
import { generateToken, hashToken, looksLikeToken } from '../../auth/tokens.js'
import type { Config } from '../../config/env.js'
import type { Database } from '../../db/kysely.js'
import { withTenant, type Tx } from '../../db/with-tenant.js'
import { apiError } from '../../http/errors.js'
import { enqueueEmail } from '../../outbox/enqueue.js'
import { renderPasswordReset } from '../../outbox/templates/password-reset.js'
import * as q from './queries.js'

const createDashboardSession = async (trx: Tx, tenantId: string, userId: string) => {
  const { token, hash } = generateToken()
  await insertSession(trx, {
    tenant_id: tenantId,
    user_id: userId,
    kind: 'dashboard',
    device_id: null,
    token_hash: hash,
    expires_at: new Date(Date.now() + DASHBOARD_SESSION_TTL_MS),
  })
  return token
}

// Signup creates the tenant inside its own fresh tenant context (D-017).
export const signup = async (
  db: Database,
  input: {
    shopName: string
    name: string
    email: string
    passwordHash: string
    pinHash: string
    locale: 'id' | 'en'
  },
): Promise<{ token: string }> => {
  const tenantId = randomUUID()
  return withTenant(db, tenantId, async (trx) => {
    await q.insertTenant(trx, { id: tenantId, name: input.shopName })
    const owner = await q.insertOwner(trx, {
      tenant_id: tenantId,
      name: input.name,
      email: input.email,
      password_hash: input.passwordHash,
      pin_hash: input.pinHash,
      locale: input.locale,
    })
    await writeAudit(trx, {
      tenantId,
      actorUserId: owner.id,
      action: 'tenant.signup',
      entityType: 'tenant',
      entityId: tenantId,
    })
    await q.markLoggedIn(trx, tenantId, owner.id)
    return { token: await createDashboardSession(trx, tenantId, owner.id) }
  })
}

export const login = async (db: Database, email: string, password: string): Promise<{ token: string }> => {
  const account = await verifyCredentials(db, email, password)
  return withTenant(db, account.tenant_id, async (trx) => {
    await q.markLoggedIn(trx, account.tenant_id, account.user_id)
    return { token: await createDashboardSession(trx, account.tenant_id, account.user_id) }
  })
}

export const logout = (trx: Tx, auth: AuthContext) => revokeSession(trx, auth.tenantId, auth.sessionId)

export const me = async (trx: Tx, auth: AuthContext) => {
  const [user, tenant] = await Promise.all([
    q.findUserProfile(trx, auth.tenantId, auth.userId),
    q.findTenantSummary(trx, auth.tenantId),
  ])
  if (!isRole(user.role)) throw apiError('UNAUTHENTICATED')
  return {
    user: { ...user, role: user.role, locale: user.locale === 'en' ? ('en' as const) : ('id' as const) },
    tenant,
    session: { kind: auth.kind, device_id: auth.deviceId },
    permissions: permissionsFor(user.role),
  }
}

// Always succeeds from the caller's point of view; never reveals whether the email exists.
export const forgotPassword = async (db: Database, config: Config, email: string): Promise<void> => {
  const account = await findLoginByEmail(db, email)
  if (!account?.is_active) return
  await withTenant(db, account.tenant_id, async (trx) => {
    const user = await findActiveUser(trx, account.tenant_id, account.user_id)
    if (!user?.email || !isRole(user.role) || !can(user.role, 'dashboard.access')) return
    const { token, hash } = generateToken()
    await q.insertPasswordToken(trx, {
      tenant_id: account.tenant_id,
      user_id: user.id,
      token_hash: hash,
      purpose: 'reset',
      expires_at: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    })
    await enqueueEmail(trx, {
      tenantId: account.tenant_id,
      kind: 'password_reset',
      to: [user.email],
      email: renderPasswordReset({
        locale: user.locale === 'en' ? 'en' : 'id',
        name: user.name,
        link: `${config.dashboardUrl}/reset?token=${encodeURIComponent(token)}`,
      }),
    })
  })
}

const invalidToken = () => apiError('VALIDATION', { field: 'token', problem: 'invalid_or_expired' })

// Consumes a single-use reset or invite token and sets the password.
export const redeemPasswordToken = async (
  db: Database,
  input: { token: string; passwordHash: string; purpose: 'reset' | 'invite' },
): Promise<void> => {
  if (!looksLikeToken(input.token)) throw invalidToken()
  const tokenHash = hashToken(input.token)
  const found = await findPasswordReset(db, tokenHash)
  if (!found || found.used_at !== null || found.expires_at.getTime() <= Date.now()) throw invalidToken()

  const ok = await withTenant(db, found.tenant_id, async (trx) => {
    const row = await q.lockPasswordToken(trx, found.tenant_id, tokenHash)
    if (
      !row ||
      row.purpose !== input.purpose ||
      row.used_at !== null ||
      row.expires_at.getTime() <= Date.now()
    ) {
      return false
    }
    const updated = await q.setPassword(trx, found.tenant_id, row.user_id, input.passwordHash)
    if (updated.numUpdatedRows === 0n) return false
    await q.markPasswordTokenUsed(trx, found.tenant_id, row.id)
    // A new password ends every existing dashboard session.
    await revokeUserSessions(trx, found.tenant_id, row.user_id, 'dashboard')
    await writeAudit(trx, {
      tenantId: found.tenant_id,
      actorUserId: row.user_id,
      action: input.purpose === 'reset' ? 'user.password_reset' : 'user.invite_accept',
      entityType: 'user',
      entityId: row.user_id,
    })
    return true
  })
  if (!ok) throw invalidToken()
}
