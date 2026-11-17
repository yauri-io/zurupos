import type { Tx } from '../db/with-tenant.js'
import type { Permission, Role } from './permissions.js'

// none: public. device: a paired device token only (staff picker, PIN login).
// dashboard: owner/manager cookie session. user: dashboard session OR device + staff session.
export type AuthMode = 'none' | 'device' | 'dashboard' | 'user'

export type DeviceContext = { deviceId: string; tenantId: string }

export type AuthContext = {
  tenantId: string
  userId: string
  role: Role
  name: string
  locale: 'id' | 'en'
  sessionId: string
  kind: 'dashboard' | 'staff'
  deviceId: string | null
}

declare module 'fastify' {
  interface FastifyContextConfig {
    // Routes without `auth` are treated as 'user' (deny by default).
    auth?: AuthMode
    permission?: Permission
  }
  interface FastifyRequest {
    auth: AuthContext | null
    device: DeviceContext | null
    tenantTx: <T>(fn: (trx: Tx) => Promise<T>) => Promise<T>
  }
}
