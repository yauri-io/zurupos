// SPEC §3.6 #2 — with tenant A set, tenant B's rows are invisible and untouchable.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DELETABLE_TABLES,
  FACTORIES,
  TABLES_WITHOUT_ID,
  TENANT_TABLES,
  type TenantTable,
} from '../support/factories.js'
import { appPool, inTx, insertRow, RLS_VIOLATION, sqlStateOf } from '../support/pg.js'
import { seedTenant, type SeededTenant } from '../support/seed.js'

const pool = appPool()
let a: SeededTenant
let b: SeededTenant

beforeAll(async () => {
  a = await seedTenant(pool, 'A')
  b = await seedTenant(pool, 'B')
})
afterAll(() => pool.end())

// Addresses tenant B's seeded row in `table`.
const targetB = (table: TenantTable): { where: string; param: string } => {
  if (table === 'tenants') return { where: 'id = $1', param: b.tenant }
  if (TABLES_WITHOUT_ID.includes(table)) return { where: 'tenant_id = $1', param: b.tenant }
  return { where: 'id = $1', param: String(b[table]) }
}

const tenantColumn = (table: TenantTable) => (table === 'tenants' ? 'id' : 'tenant_id')

const PERMISSION_DENIED = '42501'
const APPEND_ONLY: readonly TenantTable[] = ['stock_movements', 'audit_log']

describe('tenant A context', () => {
  it.each(TENANT_TABLES)('%s: sees its own row and none of B', async (table) => {
    const col = tenantColumn(table)
    const counts = await inTx(pool, a.tenant, async (c) => {
      const own = await c.query<{ n: bigint }>(`select count(*) as n from ${table} where ${col} = $1`, [
        a.tenant,
      ])
      const other = await c.query<{ n: bigint }>(`select count(*) as n from ${table} where ${col} = $1`, [
        b.tenant,
      ])
      const total = await c.query<{ n: bigint }>(`select count(*) as n from ${table} where ${col} <> $1`, [
        a.tenant,
      ])
      return { own: own.rows[0]?.n, other: other.rows[0]?.n, foreign: total.rows[0]?.n }
    })
    expect(counts).toEqual({ own: 1n, other: 0n, foreign: 0n })
  })

  it.each(TENANT_TABLES)(
    '%s: update targeting B affects 0 rows (or is not granted at all)',
    async (table) => {
      const { where, param } = targetB(table)
      const outcome = await inTx(pool, a.tenant, async (c) => {
        let rowCount: number | null = null
        const state = await sqlStateOf(c, async () => {
          rowCount = (await c.query(`update ${table} set updated_at = now() where ${where}`, [param]))
            .rowCount
        })
        return { state, rowCount }
      })
      if (APPEND_ONLY.includes(table)) expect(outcome.state).toBe(PERMISSION_DENIED)
      else expect(outcome).toEqual({ state: null, rowCount: 0 })
    },
  )

  it.each(TENANT_TABLES)(
    '%s: delete targeting B affects 0 rows (or is not granted at all)',
    async (table) => {
      const { where, param } = targetB(table)
      const outcome = await inTx(pool, a.tenant, async (c) => {
        let rowCount: number | null = null
        const state = await sqlStateOf(c, async () => {
          rowCount = (await c.query(`delete from ${table} where ${where}`, [param])).rowCount
        })
        return { state, rowCount }
      })
      if (DELETABLE_TABLES.includes(table)) expect(outcome).toEqual({ state: null, rowCount: 0 })
      else expect(outcome.state).toBe(PERMISSION_DENIED)
    },
  )

  it.each(TENANT_TABLES)('%s: insert with tenant_id = B fails the with check', async (table) => {
    const state = await inTx(pool, a.tenant, (c) =>
      sqlStateOf(c, () => insertRow(c, table, FACTORIES[table](b))),
    )
    expect(state).toBe(RLS_VIOLATION)
  })

  it.each(TENANT_TABLES.filter((t) => t !== 'tenants' && !APPEND_ONLY.includes(t)))(
    '%s: moving an own row to tenant B fails the with check',
    async (table) => {
      const where = TABLES_WITHOUT_ID.includes(table) ? 'tenant_id = $1' : 'id = $1'
      const param = TABLES_WITHOUT_ID.includes(table) ? a.tenant : String(a[table])
      const state = await inTx(pool, a.tenant, (c) =>
        sqlStateOf(c, () => c.query(`update ${table} set tenant_id = $2 where ${where}`, [param, b.tenant])),
      )
      expect(state).toBe(RLS_VIOLATION)
    },
  )

  it('append-only tables cannot be updated at all', async () => {
    for (const table of APPEND_ONLY) {
      const state = await inTx(pool, a.tenant, (c) =>
        sqlStateOf(c, () =>
          c.query(`update ${table} set updated_at = now() where tenant_id = $1`, [a.tenant]),
        ),
      )
      expect(state, table).toBe(PERMISSION_DENIED)
    }
  })

  it('a child row cannot reference a parent of another tenant (composite FK)', async () => {
    const state = await inTx(pool, a.tenant, (c) =>
      sqlStateOf(c, () => insertRow(c, 'items', { ...FACTORIES.items(a), category_id: b.categories })),
    )
    expect(state).toBe('23503') // foreign_key_violation
  })
})
