import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { FACTORIES, TENANT_TABLES, rowKey, type Refs } from './factories.js'
import { inTx, insertRow } from './pg.js'

export type SeededTenant = Refs & { tenant: string; marker: string }

// Creates a tenant with one row in every tenant table, as zuru_app inside the
// tenant's own context (so the seed itself exercises the RLS `with check`).
export const seedTenant = async (pool: pg.Pool, label: string): Promise<SeededTenant> => {
  const tenant = randomUUID()
  const refs: SeededTenant = { tenant, marker: `ZZMARK-${label}-${tenant.slice(0, 8)}` }
  await inTx(pool, tenant, async (client) => {
    for (const table of TENANT_TABLES) {
      const row = FACTORIES[table](refs)
      await insertRow(client, table, row)
      refs[table] = rowKey(table, row)
    }
  })
  return refs
}

// Adds one row to every tenant table (except `tenants`) for an existing tenant,
// e.g. a shop created through the API, so leak checks cover every table.
export const seedRowsForTenant = async (
  pool: pg.Pool,
  tenant: string,
  marker: string,
): Promise<SeededTenant> => {
  const refs: SeededTenant = { tenant, marker, tenants: tenant }
  await inTx(pool, tenant, async (client) => {
    for (const table of TENANT_TABLES) {
      if (table === 'tenants') continue
      const row = FACTORIES[table](refs)
      await insertRow(client, table, row)
      refs[table] = rowKey(table, row)
    }
  })
  return refs
}
