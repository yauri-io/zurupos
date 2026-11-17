// SPEC §12.2 reports against a seeded shop, every expected value computed by hand.
//
// Kopi shop (PB1 10%, no service charge; every ingredient costs Rp 10 per base unit):
//   A  2026-11-02 08:15  2× Kopi Susu + Croissant                          cash 79 200 (tendered 80 000)
//      subtotal 72 000, net 72 000, tax 7 200, total 79 200, COGS 2×1 900 + 10 = 3 810
//   B  2026-11-02 13:40  Kopi Susu Large+Oat (−10% item) + Croissant, −Rp 5 000 order
//      lines 36 000 → 32 400 and 22 000; after items 54 400; net 49 400; tax 4 940; total 54 340
//      QRIS GoPay 30 000 + cash 24 340. COGS 2 400 + 10 = 2 410.
//      Order discount allocation: floor(5 000×32 400/54 400) = 2 977, floor(5 000×22 000/54 400) = 2 022,
//      remainder 1 to the largest line → 2 978 / 2 022 → net after: 29 422 and 19 978.
//   C  2026-11-03 09:05  Croissant, debit 24 200 — VOIDED by the owner (restocked)
//   D  2026-11-03 10:20  3× Kopi Susu + Extra shot: 90 000, tax 9 000, total 99 000, QRIS 99 000. COGS 3×2 080 = 6 240
//   E  today             Croissant — outside the range
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, expectStatus, type TestApp } from '../support/app.js'
import { kopiShop, plainKopi, type KopiShop } from '../support/kopi.js'
import { api } from '../support/menu.js'
import { appPool, inTx } from '../support/pg.js'

let t: TestApp
let s: KopiShop
const ids: Record<string, string> = {}
const pool = appPool(1)
const RANGE = 'from=2026-11-02&to=2026-11-03'

const order = async (key: string, body: Record<string, unknown>) => {
  const res = expectStatus(
    await api(t.app, s.as.cashier, 'POST', '/v1/orders', {
      client_order_id: randomUUID(),
      order_type: 'takeaway',
      ...body,
    }),
    201,
  )
  ids[key] = res.json<{ id: string }>().id
}

// Moves an order to a fixed local time (Asia/Jakarta) and its business date.
const at = (key: string, local: string) =>
  inTx(pool, s.tenantId, (c) =>
    c.query(
      `update orders set paid_at = ($2::timestamp at time zone 'Asia/Jakarta'), business_date = $2::date where id = $1`,
      [ids[key], local],
    ),
  )

beforeAll(async () => {
  t = await createTestApp()
  s = await kopiShop(t.app, 'reports')
  const croissant = { item_id: s.item.croissant, qty: 1 }
  await order('A', {
    lines: [{ item_id: s.item.kopiSusu, qty: 2, option_ids: plainKopi(s) }, croissant],
    payments: [{ method: 'cash', amount: 79200, tendered: 80000 }],
  })
  await order('B', {
    lines: [
      {
        item_id: s.item.kopiSusu,
        qty: 1,
        option_ids: [s.opt.large, s.opt.normalSugar, s.opt.oat],
        discount: { discount_id: s.discount.item10 },
      },
      croissant,
    ],
    order_discount: { discount_id: s.discount.order5k },
    payments: [
      { method: 'qris', amount: 30000, provider: 'GoPay' },
      { method: 'cash', amount: 24340, tendered: 24340 },
    ],
  })
  await order('C', { lines: [croissant], payments: [{ method: 'debit', amount: 24200 }] })
  await order('D', {
    lines: [{ item_id: s.item.kopiSusu, qty: 3, option_ids: [...plainKopi(s), s.opt.shot] }],
    payments: [{ method: 'qris', amount: 99000 }],
  })
  await order('E', { lines: [croissant], payments: [{ method: 'cash', amount: 24200, tendered: 24200 }] })
  expectStatus(
    await api(t.app, s.as.owner, 'POST', `/v1/orders/${ids['C']}/void`, {
      reason: 'Salah input',
      restock: true,
    }),
    200,
  )
  await at('A', '2026-11-02 08:15')
  await at('B', '2026-11-02 13:40')
  await at('C', '2026-11-03 09:05')
  await at('D', '2026-11-03 10:20')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

const get = async <T>(path: string) => expectStatus(await api(t.app, s.as.owner, 'GET', path), 200).json<T>()

describe('reports (owner)', () => {
  it('summary', async () => {
    expect(await get(`/v1/reports/summary?${RANGE}`)).toEqual({
      from: '2026-11-02',
      to: '2026-11-03',
      gross_sales: 220000,
      discounts: 8600,
      net_sales: 211400,
      service_charge: 0,
      tax: 21140,
      total_collected: 232540,
      orders: 3,
      average_order_value: 70467, // 211 400 / 3 = 70 466.67
      cogs: 12460,
      gross_margin: 198940,
      margin_bps: 9411, // 94.1059 %
    })
  })

  it('daily, with an empty day', async () => {
    const zero = {
      gross_sales: 0,
      discounts: 0,
      net_sales: 0,
      service_charge: 0,
      tax: 0,
      total_collected: 0,
      orders: 0,
    }
    expect(await get(`/v1/reports/daily?from=2026-11-01&to=2026-11-03`)).toEqual({
      days: [
        { business_date: '2026-11-01', ...zero },
        {
          business_date: '2026-11-02',
          gross_sales: 130000,
          discounts: 8600,
          net_sales: 121400,
          service_charge: 0,
          tax: 12140,
          total_collected: 133540,
          orders: 2,
        },
        {
          business_date: '2026-11-03',
          gross_sales: 90000,
          discounts: 0,
          net_sales: 90000,
          service_charge: 0,
          tax: 9000,
          total_collected: 99000,
          orders: 1,
        },
      ],
    })
  })

  it('hourly, by local hour', async () => {
    const { hours } = await get<{ hours: { hour: number; orders: number; net_sales: number }[] }>(
      `/v1/reports/hourly?${RANGE}`,
    )
    expect(hours).toHaveLength(24)
    expect(hours.filter((h) => h.orders > 0)).toEqual([
      { hour: 8, orders: 1, net_sales: 72000 },
      { hour: 10, orders: 1, net_sales: 90000 },
      { hour: 13, orders: 1, net_sales: 49400 },
    ])
  })

  it('items and categories, with the order discount allocated', async () => {
    expect(await get(`/v1/reports/items?${RANGE}`)).toEqual({
      items: [
        {
          item_id: s.item.kopiSusu,
          name: 'Kopi Susu Gula Aren',
          category_name: 'Kopi',
          qty: 6,
          net_sales: 172400,
          net_after_order_discount: 169422,
        },
        {
          item_id: s.item.croissant,
          name: 'Croissant',
          category_name: 'Makanan',
          qty: 2,
          net_sales: 44000,
          net_after_order_discount: 41978,
        },
      ],
    })
    expect(await get(`/v1/reports/categories?${RANGE}`)).toEqual({
      categories: [
        { name: 'Kopi', qty: 6, net_sales: 172400, net_after_order_discount: 169422 },
        { name: 'Makanan', qty: 2, net_sales: 44000, net_after_order_discount: 41978 },
      ],
    })
  })

  it('payments by method and provider (voided debit excluded)', async () => {
    expect(await get(`/v1/reports/payments?${RANGE}`)).toEqual({
      total: 232540,
      methods: [
        { method: 'cash', provider: null, count: 2, amount: 103540 },
        { method: 'qris', provider: null, count: 1, amount: 99000 },
        { method: 'qris', provider: 'GoPay', count: 1, amount: 30000 },
      ],
    })
  })

  it('margin, overall and per item', async () => {
    expect(await get(`/v1/reports/margin?${RANGE}`)).toEqual({
      net_sales: 211400,
      cogs: 12460,
      gross_margin: 198940,
      margin_bps: 9411,
      items: [
        {
          item_id: s.item.kopiSusu,
          name: 'Kopi Susu Gula Aren',
          net_after_order_discount: 169422,
          cogs: 12440, // 3 800 + 2 400 + 6 240
          gross_margin: 156982,
          margin_bps: 9266,
        },
        {
          item_id: s.item.croissant,
          name: 'Croissant',
          net_after_order_discount: 41978,
          cogs: 20,
          gross_margin: 41958,
          margin_bps: 9995,
        },
      ],
    })
  })

  it('voids, with reason and voider', async () => {
    const res = await get<{ count: number; total: number; orders: Record<string, unknown>[] }>(
      `/v1/reports/voids?${RANGE}`,
    )
    expect(res).toMatchObject({
      count: 1,
      total: 24200,
      orders: [
        {
          id: ids['C'],
          business_date: '2026-11-03',
          total: 24200,
          reason: 'Salah input',
          restock: true,
          voided_by: { id: s.owner.id },
          approved_by: null,
        },
      ],
    })
  })

  it('stock value: Σ max(stock, 0) × avg cost', async () => {
    // Opening 24 820 units × Rp 10 = 248 200, minus 1 246 units sold in A, B, D and E's 1 croissant.
    const res = await get<{ total: number; ingredients: { name: string; value: number }[] }>(
      '/v1/reports/stock-value',
    )
    expect(res.total).toBe(248200 - 12460 - 10)
    expect(res.ingredients.find((i) => i.name === 'Croissant')?.value).toBe((20 - 3) * 10)
  })

  it('a range outside the data is all zeros; E (today) is not in 2026-11-02..03', async () => {
    const empty = await get<{ orders: number; average_order_value: number; margin_bps: null }>(
      '/v1/reports/summary?from=2026-10-01&to=2026-10-31',
    )
    expect(empty).toMatchObject({ orders: 0, average_order_value: 0, margin_bps: null })
  })
})

describe('report validation and access', () => {
  it.each([
    ['from=2026-11-03&to=2026-11-02', 'before_from'],
    ['from=2026-02-30&to=2026-03-01', 'invalid_date'],
    ['from=2025-01-01&to=2026-01-02', 'range_too_long'],
  ])('%s → 400 %s', async (query, problem) => {
    const res = await api(t.app, s.as.owner, 'GET', `/v1/reports/summary?${query}`)
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION', details: { problem } } })
  })

  it('a full year is allowed', async () => {
    expect(
      (await api(t.app, s.as.owner, 'GET', '/v1/reports/summary?from=2025-01-01&to=2025-12-31')).statusCode,
    ).toBe(200)
  })

  it.each(['manager', 'cashier', 'employee'] as const)('%s gets 403', async (role) => {
    for (const path of ['summary', 'margin', 'voids', 'stock-value']) {
      const res = await api(t.app, s.as[role], 'GET', `/v1/reports/${path}?${RANGE}`)
      expect(res.statusCode, path).toBe(403)
    }
  })
})
