// D-075: auth.report_schedule(), the fifth reviewed pre-tenant function. It must
// return schedule fields only, only for shops that can receive a report email,
// and be callable by zuru_app alone.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, signupShop, type Shop, type TestApp } from '../support/app.js'
import { appPool, inTx, workerPool } from '../support/pg.js'

let t: TestApp
const pool = appPool(2)
let on: Shop
let off: Shop
let weeklyOnly: Shop
let noOwner: Shop

type Row = Record<string, unknown> & { tenant_id: string }
const schedule = async () =>
  inTx(pool, null, async (c) => (await c.query<Row>('select * from auth.report_schedule()')).rows)

beforeAll(async () => {
  t = await createTestApp()
  on = await signupShop(t.app, 'sched-on')
  off = await signupShop(t.app, 'sched-off')
  weeklyOnly = await signupShop(t.app, 'sched-weekly')
  noOwner = await signupShop(t.app, 'sched-no-owner')
  await inTx(pool, off.tenantId, (c) =>
    c.query('update tenants set daily_summary_enabled = false, weekly_summary_enabled = false'),
  )
  await inTx(pool, weeklyOnly.tenantId, (c) =>
    c.query(
      `update tenants set daily_summary_enabled = false, timezone = 'Asia/Makassar', business_day_cutoff_hour = 2`,
    ),
  )
  await inTx(pool, noOwner.tenantId, (c) =>
    c.query(`update users set is_active = false where role = 'owner'`),
  )
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

describe('auth.report_schedule() (D-075)', () => {
  it('returns exactly the schedule columns, nothing else', async () => {
    // RETURNS TABLE columns are the function's OUT parameters; it takes no input.
    const fn = await inTx(
      pool,
      null,
      async (c) =>
        (
          await c.query<{ names: string[]; modes: string[] }>(
            `select proargnames as names, proargmodes::text[] as modes
           from pg_proc where oid = 'auth.report_schedule()'::regprocedure`,
          )
        ).rows[0],
    )
    expect(fn?.names).toEqual([
      'tenant_id',
      'timezone',
      'business_day_cutoff_hour',
      'daily_summary_enabled',
      'weekly_summary_enabled',
    ])
    expect(new Set(fn?.modes)).toEqual(new Set(['t']))
    const rows = await schedule()
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(Object.keys(r)).toEqual(fn?.names)
  })

  it('lists shops with an active owner and at least one email on, without a tenant context', async () => {
    const rows = await schedule()
    const byId = new Map(rows.map((r) => [r.tenant_id, r]))
    expect(byId.get(on.tenantId)).toEqual({
      tenant_id: on.tenantId,
      timezone: 'Asia/Jakarta',
      business_day_cutoff_hour: 0,
      daily_summary_enabled: true,
      weekly_summary_enabled: true,
    })
    expect(byId.get(weeklyOnly.tenantId)).toEqual({
      tenant_id: weeklyOnly.tenantId,
      timezone: 'Asia/Makassar',
      business_day_cutoff_hour: 2,
      daily_summary_enabled: false,
      weekly_summary_enabled: true,
    })
    expect(byId.has(off.tenantId)).toBe(false)
    expect(byId.has(noOwner.tenantId)).toBe(false)
  })

  it('does not open the tenants table itself to zuru_app', async () => {
    const visible = await inTx(pool, null, async (c) => (await c.query('select id from tenants')).rowCount)
    expect(visible).toBe(0)
  })

  it('cannot be executed by zuru_worker', async () => {
    const worker = workerPool(1)
    try {
      await expect(worker.query('select * from auth.report_schedule()')).rejects.toMatchObject({
        code: '42501',
      })
    } finally {
      await worker.end()
    }
  })
})
