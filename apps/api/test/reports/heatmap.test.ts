// SPEC §12.4 operational heatmap against a seeded shop, every value by hand.
//
// Kopi shop in Asia/Makassar (WITA, UTC+8), business-day cutoff 02:00. Every
// order is one Croissant: net sales Rp 22.000 (PB1 10% → total Rp 24.200).
//
// 2026-10-05 … 2026-11-02 (29 days: 5 Mondays, 4 Tuesdays):
//   every Monday   09:10 ×1 and 11:00 ×3     → Mon 09: 5 orders / 5 days, Mon 11: 15 / 5
//   every Tuesday  09:20 ×1                  → Tue 09: 4 / 4 (same average as Monday, fewer orders)
//   Tue 2026-10-06 14:05 ×1                  → Tue 14: 1 / 4 = 0,25 → 0,3 (tenths: 2,5 → 3)
//   Wed 2026-10-07 10:00 ×1, VOIDED          → Wednesday stays empty (null row)
// 2026-11-06 (Friday): 23:30 and 01:30 the next night, both business date 11-06
//   → the 01:30 order sits at the end of Friday's row, after 23:00.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, expectStatus, type TestApp } from '../support/app.js'
import { kopiShop, type KopiShop } from '../support/kopi.js'
import { api } from '../support/menu.js'
import { appPool, inTx } from '../support/pg.js'

let t: TestApp
let s: KopiShop
const pool = appPool(1)
const TZ = 'Asia/Makassar'
const NET = 22000

const mondays = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']
const tuesdays = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']

// One croissant order, then moved to a local time in the shop's zone and a business date.
const order = async (local: string, businessDate: string) => {
  const res = expectStatus(
    await api(t.app, s.as.cashier, 'POST', '/v1/orders', {
      client_order_id: randomUUID(),
      order_type: 'takeaway',
      lines: [{ item_id: s.item.croissant, qty: 1 }],
      payments: [{ method: 'cash', amount: 24200, tendered: 24200 }],
    }),
    201,
  )
  const id = res.json<{ id: string }>().id
  await inTx(pool, s.tenantId, (c) =>
    c.query(
      `update orders set paid_at = ($2::timestamp at time zone $3), business_date = $4::date where id = $1`,
      [id, local, TZ, businessDate],
    ),
  )
  return id
}

beforeAll(async () => {
  t = await createTestApp()
  s = await kopiShop(t.app, 'heatmap')
  expectStatus(
    await api(t.app, s.as.owner, 'PATCH', '/v1/settings', { timezone: TZ, business_day_cutoff_hour: 2 }),
    200,
  )
  for (const d of mondays) {
    await order(`${d} 09:10`, d)
    for (let i = 0; i < 3; i++) await order(`${d} 11:00`, d)
  }
  for (const d of tuesdays) await order(`${d} 09:20`, d)
  await order('2026-10-06 14:05', '2026-10-06')
  const voided = await order('2026-10-07 10:00', '2026-10-07')
  expectStatus(
    await api(t.app, s.as.owner, 'POST', `/v1/orders/${voided}/void`, {
      reason: 'Salah input',
      restock: true,
    }),
    200,
  )
  await order('2026-11-06 23:30', '2026-11-06')
  await order('2026-11-07 01:30', '2026-11-06')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

type Cell = { hour: number; orders: number; net_sales: number; avg_orders_x10: number; avg_net_sales: number }
type Heatmap = {
  from: string
  to: string
  cutoff_hour: number
  hours: number[]
  weekdays: { weekday: number; trading_days: number; cells: (Cell | null)[] }[]
  weeks_of_data: number
  reliable: boolean
  insight: Record<'orders' | 'net_sales', unknown>
}

const get = async (query: string, creds = s.as.owner) =>
  api(t.app, creds, 'GET', `/v1/reports/heatmap?${query}`)
const heatmap = async (query: string) => expectStatus(await get(query), 200).json<Heatmap>()

const cell = (hour: number, orders: number, days: number): Cell => ({
  hour,
  orders,
  net_sales: orders * NET,
  // Half up, as in the report: tenths of an order, whole rupiah.
  avg_orders_x10: Math.floor((orders * 10 * 2 + days) / (days * 2)),
  avg_net_sales: Math.floor((orders * NET * 2 + days) / (days * 2)),
})
const empty = (hour: number): Cell => ({ hour, orders: 0, net_sales: 0, avg_orders_x10: 0, avg_net_sales: 0 })

describe('GET /v1/reports/heatmap', () => {
  it('averages per trading day, trims the hours and leaves closed weekdays null', async () => {
    const h = await heatmap('from=2026-10-05&to=2026-11-02')
    expect(h.cutoff_hour).toBe(2)
    expect(h.hours).toEqual([9, 10, 11, 12, 13, 14])
    const [mon, tue, wed, ...rest] = h.weekdays
    expect(mon).toEqual({
      weekday: 1,
      trading_days: 5,
      cells: [cell(9, 5, 5), empty(10), cell(11, 15, 5), empty(12), empty(13), empty(14)],
    })
    // 4 orders over 4 Tuesdays averages the same as 5 over 5 Mondays.
    expect(tue?.cells[0]).toEqual({
      hour: 9,
      orders: 4,
      net_sales: 88000,
      avg_orders_x10: 10,
      avg_net_sales: 22000,
    })
    expect(mon?.cells[0]).toMatchObject({ avg_orders_x10: 10, avg_net_sales: 22000 })
    expect(tue?.cells[5]).toEqual({
      hour: 14,
      orders: 1,
      net_sales: 22000,
      avg_orders_x10: 3,
      avg_net_sales: 5500,
    })
    expect(tue?.trading_days).toBe(4)
    // The voided Wednesday order doesn't count.
    expect(wed).toEqual({ weekday: 3, trading_days: 0, cells: [null, null, null, null, null, null] })
    for (const w of rest) expect(w.cells.every((c) => c === null)).toBe(true)
  })

  it('names the busiest and quietest times once every weekday has 3 weeks of data', async () => {
    const h = await heatmap('from=2026-10-05&to=2026-11-02')
    expect(h.weeks_of_data).toBe(4)
    expect(h.reliable).toBe(true)
    expect(h.insight).toEqual({
      // Monday 11:00: 3,0 orders a day; Tuesday 14:00: 0,3 → 30 / 3 = 10×.
      orders: {
        busiest: { weekday: 1, hour: 11, avg: 30 },
        quietest: { weekday: 2, hour: 14, avg: 3 },
        ratio: 10,
      },
      // Rp 66.000 / Rp 5.500 = 12×.
      net_sales: {
        busiest: { weekday: 1, hour: 11, avg: 66000 },
        quietest: { weekday: 2, hour: 14, avg: 5500 },
        ratio: 12,
      },
    })
  })

  it('is not reliable with fewer than 3 weeks on a trading weekday, and has no insight then', async () => {
    // 3 Mondays but only 2 Tuesdays.
    const h = await heatmap('from=2026-10-05&to=2026-10-19')
    expect(h.weeks_of_data).toBe(2)
    expect(h.reliable).toBe(false)
    expect(h.insight).toEqual({ orders: null, net_sales: null })
  })

  it('puts an order after midnight at the end of its business day, in the shop time zone', async () => {
    const h = await heatmap('from=2026-11-06&to=2026-11-06')
    // Cutoff 2: 23:00, 00:00, 01:00. In Jakarta time the 01:30 WITA order would be 00:30.
    expect(h.hours).toEqual([23, 0, 1])
    expect(h.weekdays[4]).toEqual({
      weekday: 5,
      trading_days: 1,
      cells: [cell(23, 1, 1), empty(0), cell(1, 1, 1)],
    })
    expect(h.weekdays[5]?.trading_days).toBe(0)
  })

  it('is empty for a range without orders', async () => {
    const h = await heatmap('from=2026-09-01&to=2026-09-30')
    expect(h).toMatchObject({ hours: [], weeks_of_data: 0, reliable: false })
    expect(h.weekdays.map((w) => w.cells)).toEqual(Array(7).fill([]))
  })

  it('accepts at most 92 days', async () => {
    expectStatus(await get('from=2026-08-03&to=2026-11-02'), 200) // 92 days
    const res = expectStatus(await get('from=2026-08-02&to=2026-11-02'), 400)
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION', details: { field: 'to', problem: 'range_too_long', max_days: 92 } },
    })
  })

  it('is owner only', async () => {
    expectStatus(await get('from=2026-10-05&to=2026-11-02', s.as.manager), 403)
    expectStatus(await get('from=2026-10-05&to=2026-11-02', s.as.cashier), 403)
  })
})
