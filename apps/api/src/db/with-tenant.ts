import { sql, type Transaction } from 'kysely'
import type { Database } from './kysely.js'
import type { DB } from './types.js'

export type Tx = Transaction<DB>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Every tenant-scoped query runs inside this (SPEC §3.3). The tenant id is set
// LOCAL to the transaction (set_config(..., true)), so it vanishes at commit or
// rollback and a pooled connection never carries it into another request.
// `tenantId` must come from a verified session or device token, never from input.
export const withTenant = <T>(db: Database, tenantId: string, fn: (trx: Tx) => Promise<T>): Promise<T> => {
  if (!UUID.test(tenantId)) return Promise.reject(new Error('withTenant: tenantId is not a uuid'))
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(trx)
    return fn(trx)
  })
}
