// SPEC §3.6 #1 — with no app.tenant_id set, nothing is visible and nothing can be written.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FACTORIES, TENANT_TABLES } from '../support/factories.js'
import { appPool, inTx, insertRow, RLS_VIOLATION, sqlStateOf } from '../support/pg.js'
import { seedTenant, type SeededTenant } from '../support/seed.js'

const pool = appPool()
let a: SeededTenant

beforeAll(async () => {
  a = await seedTenant(pool, 'A')
})
afterAll(() => pool.end())

describe('no tenant context', () => {
  it('runs as zuru_app', async () => {
    const { rows } = await pool.query<{ u: string }>('select current_user as u')
    expect(rows[0]?.u).toBe('zuru_app')
  })

  it.each(TENANT_TABLES)('%s: select count(*) returns 0', async (table) => {
    const count = await inTx(pool, null, async (c) => {
      const { rows } = await c.query<{ n: bigint }>(`select count(*) as n from ${table}`)
      return rows[0]?.n
    })
    expect(count).toBe(0n)
  })

  it.each(TENANT_TABLES)('%s: insert of a valid row fails with an RLS violation', async (table) => {
    const state = await inTx(pool, null, (c) => sqlStateOf(c, () => insertRow(c, table, FACTORIES[table](a))))
    expect(state).toBe(RLS_VIOLATION)
  })

  it('an empty-string tenant id behaves like no context', async () => {
    const count = await inTx(pool, null, async (c) => {
      await c.query(`select set_config('app.tenant_id', '', true)`)
      const { rows } = await c.query<{ n: bigint }>('select count(*) as n from users')
      return rows[0]?.n
    })
    expect(count).toBe(0n)
  })

  it('a LOCAL tenant context does not survive the transaction on a pooled connection', async () => {
    const single = appPool(1)
    try {
      await inTx(single, a.tenant, async (c) => {
        const { rows } = await c.query<{ n: bigint }>('select count(*) as n from users')
        expect(rows[0]?.n).toBe(1n)
      })
      const { rows } = await single.query<{ t: string | null; n: bigint }>(
        `select current_setting('app.tenant_id', true) as t, (select count(*) from users) as n`,
      )
      expect(rows[0]?.t ?? '').toBe('')
      expect(rows[0]?.n).toBe(0n)
    } finally {
      await single.end()
    }
  })
})
