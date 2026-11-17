import type { Tx } from '../../db/with-tenant.js'

export const insertDevice = (
  trx: Tx,
  row: {
    tenant_id: string
    name: string
    token_hash: Buffer
    paired_by_user_id: string
    app_version: string | null
  },
) => trx.insertInto('devices').values(row).returning(['id', 'name']).executeTakeFirstOrThrow()

export const findTenantName = (trx: Tx, tenantId: string) =>
  trx.selectFrom('tenants').select(['name']).where('id', '=', tenantId).executeTakeFirstOrThrow()

export const listDevices = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('devices as d')
    .innerJoin('users as u', (j) =>
      j.onRef('u.tenant_id', '=', 'd.tenant_id').onRef('u.id', '=', 'd.paired_by_user_id'),
    )
    .select([
      'd.id',
      'd.name',
      'd.app_version',
      'd.last_seen_at',
      'd.revoked_at',
      'd.created_at',
      'u.id as paired_by_id',
      'u.name as paired_by_name',
    ])
    .where('d.tenant_id', '=', tenantId)
    .orderBy('d.created_at', 'desc')
    .execute()

export const revokeDevice = (trx: Tx, tenantId: string, deviceId: string) =>
  trx
    .updateTable('devices')
    .set({ revoked_at: new Date() })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', deviceId)
    .where('revoked_at', 'is', null)
    .returning(['id'])
    .executeTakeFirst()

export const deviceExists = (trx: Tx, tenantId: string, deviceId: string) =>
  trx
    .selectFrom('devices')
    .select(['id'])
    .where('tenant_id', '=', tenantId)
    .where('id', '=', deviceId)
    .executeTakeFirst()

export const listActiveStaff = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('users')
    .select(['id', 'name', 'role'])
    .where('tenant_id', '=', tenantId)
    .where('is_active', '=', true)
    .orderBy('name')
    .execute()

export const touchDevice = (trx: Tx, tenantId: string, deviceId: string, appVersion: string | undefined) =>
  trx
    .updateTable('devices')
    .set(appVersion ? { last_seen_at: new Date(), app_version: appVersion } : { last_seen_at: new Date() })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', deviceId)
    .execute()
