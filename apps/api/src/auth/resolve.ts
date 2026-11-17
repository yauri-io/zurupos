// Turns request credentials into a verified tenant + user context.
import type { Database } from '../db/kysely.js'
import { withTenant } from '../db/with-tenant.js'
import { apiError } from '../http/errors.js'
import { DASHBOARD_SESSION_REFRESH_MS, DASHBOARD_SESSION_TTL_MS } from './constants.js'
import type { AuthContext, DeviceContext } from './context.js'
import { findDevice, findSession, type SessionLookup } from './lookups.js'
import { can, isRole } from './permissions.js'
import { findActiveUser, sessionLastUsed, touchSession } from './queries.js'
import { hashToken, looksLikeToken } from './tokens.js'

const unauthenticated = () => apiError('UNAUTHENTICATED')

const isLive = (s: SessionLookup) => s.revoked_at === null && s.expires_at.getTime() > Date.now()

export const resolveDevice = async (db: Database, rawToken: unknown): Promise<DeviceContext> => {
  if (!looksLikeToken(rawToken)) throw unauthenticated()
  const device = await findDevice(db, hashToken(rawToken))
  if (!device || device.revoked_at !== null) throw unauthenticated()
  return { deviceId: device.device_id, tenantId: device.tenant_id }
}

const loadUserContext = async (
  db: Database,
  session: SessionLookup,
  slidingExpiry: boolean,
): Promise<AuthContext> =>
  withTenant(db, session.tenant_id, async (trx) => {
    const user = await findActiveUser(trx, session.tenant_id, session.user_id)
    if (!user || !isRole(user.role)) throw unauthenticated()
    const last = await sessionLastUsed(trx, session.tenant_id, session.session_id)
    if (last && Date.now() - last.last_used_at.getTime() > DASHBOARD_SESSION_REFRESH_MS) {
      const expiresAt = slidingExpiry ? new Date(Date.now() + DASHBOARD_SESSION_TTL_MS) : null
      await touchSession(trx, session.tenant_id, session.session_id, expiresAt)
    }
    return {
      tenantId: session.tenant_id,
      userId: user.id,
      role: user.role,
      name: user.name,
      locale: user.locale === 'en' ? 'en' : 'id',
      sessionId: session.session_id,
      kind: session.kind,
      deviceId: session.device_id,
    }
  })

export const resolveDashboardSession = async (db: Database, rawToken: unknown): Promise<AuthContext> => {
  if (!looksLikeToken(rawToken)) throw unauthenticated()
  const session = await findSession(db, hashToken(rawToken))
  if (!session || session.kind !== 'dashboard' || !isLive(session)) throw unauthenticated()
  const ctx = await loadUserContext(db, session, true)
  // A user demoted from manager keeps no dashboard access.
  if (!can(ctx.role, 'dashboard.access')) throw unauthenticated()
  return ctx
}

// Both tokens must be valid and belong to the same tenant and device (SPEC §5.3).
export const resolveStaffSession = async (
  db: Database,
  device: DeviceContext,
  rawBearer: unknown,
): Promise<AuthContext> => {
  if (!looksLikeToken(rawBearer)) throw unauthenticated()
  const session = await findSession(db, hashToken(rawBearer))
  if (
    !session ||
    session.kind !== 'staff' ||
    !isLive(session) ||
    session.tenant_id !== device.tenantId ||
    session.device_id !== device.deviceId
  ) {
    throw unauthenticated()
  }
  return loadUserContext(db, session, false)
}

export const bearerToken = (header: string | undefined): string | undefined => {
  if (!header) return undefined
  const [scheme, value] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' ? value : undefined
}
