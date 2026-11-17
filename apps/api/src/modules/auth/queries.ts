import type { Tx } from '../../db/with-tenant.js'

export const insertTenant = (trx: Tx, row: { id: string; name: string }) =>
  trx.insertInto('tenants').values(row).execute()

export const insertOwner = (
  trx: Tx,
  row: {
    tenant_id: string
    name: string
    email: string
    password_hash: string
    pin_hash: string
    locale: string
  },
) =>
  trx
    .insertInto('users')
    .values({ ...row, role: 'owner' })
    .returning(['id'])
    .executeTakeFirstOrThrow()

export const markLoggedIn = (trx: Tx, tenantId: string, userId: string) =>
  trx
    .updateTable('users')
    .set({ last_login_at: new Date() })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', userId)
    .execute()

export const findTenantSummary = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('tenants')
    .select(['id', 'name', 'timezone'])
    .where('id', '=', tenantId)
    .executeTakeFirstOrThrow()

export const findUserProfile = (trx: Tx, tenantId: string, userId: string) =>
  trx
    .selectFrom('users')
    .select(['id', 'name', 'role', 'email', 'locale'])
    .where('tenant_id', '=', tenantId)
    .where('id', '=', userId)
    .executeTakeFirstOrThrow()

export const insertPasswordToken = (
  trx: Tx,
  row: {
    tenant_id: string
    user_id: string
    token_hash: Buffer
    purpose: 'reset' | 'invite'
    expires_at: Date
  },
) => trx.insertInto('password_resets').values(row).execute()

export const lockPasswordToken = (trx: Tx, tenantId: string, tokenHash: Buffer) =>
  trx
    .selectFrom('password_resets')
    .select(['id', 'user_id', 'purpose', 'expires_at', 'used_at'])
    .where('tenant_id', '=', tenantId)
    .where('token_hash', '=', tokenHash)
    .forUpdate()
    .executeTakeFirst()

export const markPasswordTokenUsed = (trx: Tx, tenantId: string, id: string) =>
  trx
    .updateTable('password_resets')
    .set({ used_at: new Date() })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .execute()

export const setPassword = (trx: Tx, tenantId: string, userId: string, passwordHash: string) =>
  trx
    .updateTable('users')
    .set({ password_hash: passwordHash })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', userId)
    .where('is_active', '=', true)
    .where('role', 'in', ['owner', 'manager'])
    .executeTakeFirst()
