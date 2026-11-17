import type { Tx } from '../../db/with-tenant.js'

const USER_COLUMNS = [
  'id',
  'name',
  'role',
  'email',
  'locale',
  'is_active',
  'password_hash',
  'last_login_at',
  'created_at',
] as const

export const listUsers = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('users')
    .select(USER_COLUMNS)
    .where('tenant_id', '=', tenantId)
    .orderBy('is_active', 'desc')
    .orderBy('name')
    .execute()

export const findUserForUpdate = (trx: Tx, tenantId: string, userId: string) =>
  trx
    .selectFrom('users')
    .select(USER_COLUMNS)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', userId)
    .forUpdate()
    .executeTakeFirst()

export const insertUser = (
  trx: Tx,
  row: {
    tenant_id: string
    name: string
    role: string
    email: string | null
    pin_hash: string
    locale: string
  },
) => trx.insertInto('users').values(row).returning(USER_COLUMNS).executeTakeFirstOrThrow()

export const updateUser = (
  trx: Tx,
  tenantId: string,
  userId: string,
  patch: {
    name?: string
    role?: string
    email?: string | null
    locale?: string
    password_hash?: string | null
    pin_hash?: string
    is_active?: boolean
  },
) =>
  trx
    .updateTable('users')
    .set(patch)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', userId)
    .returning(USER_COLUMNS)
    .executeTakeFirstOrThrow()

export const findTenantName = (trx: Tx, tenantId: string) =>
  trx.selectFrom('tenants').select(['name']).where('id', '=', tenantId).executeTakeFirstOrThrow()

export const insertInvite = (
  trx: Tx,
  row: { tenant_id: string; user_id: string; token_hash: Buffer; expires_at: Date },
) =>
  trx
    .insertInto('password_resets')
    .values({ ...row, purpose: 'invite' })
    .execute()
