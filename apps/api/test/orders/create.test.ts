// POST /v1/orders — SPEC §7.2, §6.4, §6.5 against the real database.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '../support/app.js'
import { invariant, kopiShop, plainKopi, stockOf, type KopiShop } from '../support/kopi.js'
import { api, type Json } from '../support/menu.js'
import { appPool, inTx } from '../support/pg.js'
import { auditActions } from '../support/roles.js'

let t: TestApp
let s: KopiShop
const pool = appPool(1)

beforeAll(async () => {
  t = await createTestApp()
  s = await kopiShop(t.app, 'orders')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

type Order = {
  id: string
  order_number: number
  status: string
  subtotal: number
  item_discount_total: number
  net_sales: number
  tax_amount: number
  total: number
  change_due: number
  cogs_total?: number
  lines: {
    item_name: string
    line_net: number
    discount: unknown
    modifiers: { option_name: string }[]
    cogs?: string
  }[]
  payments: { method: string; amount: number; tendered: number | null; reference: string | null }[]
}

const order = (body: Json) => ({
  client_order_id: randomUUID(),
  order_type: 'takeaway',
  payments: [],
  ...body,
})
const kopi = (qty = 1, options = plainKopi(s), extra: Json = {}) => ({
  item_id: s.item.kopiSusu,
  qty,
  option_ids: options,
  ...extra,
})
const cash = (amount: number, tendered = amount) => ({ method: 'cash', amount, tendered })
const post = (body: Json, creds = s.as.cashier) => api(t.app, creds, 'POST', '/v1/orders', body)

describe('UAT #6 order', () => {
  it('2× Kopi Susu (Large, Oat, Less sugar) + Croissant with 10% item discount, split cash + QRIS', async () => {
    const before = await stockOf(t.app, s)
    const res = await post(
      order({
        customer_name: 'Dina',
        lines: [
          kopi(2, [s.opt.large, s.opt.lessSugar, s.opt.oat], { note: 'less ice' }),
          { item_id: s.item.croissant, qty: 1, discount: { discount_id: s.discount.item10 } },
        ],
        payments: [cash(20000), { method: 'qris', amount: 80980, provider: 'GoPay', reference: '8821' }],
        expected_total: 100980,
      }),
    )
    expect(res.statusCode, res.body).toBe(201)
    const o = res.json<Order>()
    // 2 × (25 000 + 5 000 + 6 000) = 72 000; croissant 22 000 − 2 200; PB1 10 % of 91 800.
    expect(o).toMatchObject({
      status: 'paid',
      subtotal: 94000,
      item_discount_total: 2200,
      net_sales: 91800,
      tax_amount: 9180,
      total: 100980,
      change_due: 0,
    })
    expect(o.lines[0]?.modifiers.map((m) => m.option_name)).toEqual(['Large', 'Less sugar', 'Oat milk'])
    expect(o.lines[1]).toMatchObject({ line_net: 19800, discount: { name: 'Diskon 10%', amount: 2200 } })
    expect(o.payments).toEqual([
      { seq: 1, method: 'cash', amount: 20000, tendered: 20000, provider: null, reference: null },
      { seq: 2, method: 'qris', amount: 80980, tendered: null, provider: 'GoPay', reference: '8821' },
    ])

    // Stock deducted exactly: per Kopi Susu Large+Oat+Less: beans 18, oat 200, aren 10, cup16 1, lid 1.
    const after = await stockOf(t.app, s)
    const used = (k: keyof typeof after) => Number(before[k]) - Number(after[k])
    expect({
      beans: used('beans'),
      oat: used('oat'),
      aren: used('aren'),
      cup16: used('cup16'),
      lid: used('lid'),
      milk: used('milk'),
      cup12: used('cup12'),
      croissant: used('croissant'),
    }).toEqual({ beans: 36, oat: 400, aren: 20, cup16: 2, lid: 2, milk: 0, cup12: 0, croissant: 1 })
    expect(await invariant(t.app, s)).toEqual([])
  })

  it('records COGS at average cost, visible to the owner only', async () => {
    const res = await post(order({ lines: [kopi(1)], payments: [cash(27500)] }))
    const o = res.json<Order>()
    expect(o.cogs_total).toBeUndefined()
    expect(o.lines[0]?.cogs).toBeUndefined()
    const owner = (await api(t.app, s.as.owner, 'GET', `/v1/orders/${o.id}`)).json<Order>()
    // Every ingredient costs Rp 10 per unit: 18 + 150 + 20 + 1 + 1 = 190 units → Rp 1.900.
    expect(owner.cogs_total).toBe(1900)
    expect(owner.lines[0]?.cogs).toBe('1900')
  })
})

describe('numbering and idempotency', () => {
  it('numbers orders sequentially per business day', async () => {
    const a = (await post(order({ lines: [kopi()], payments: [cash(27500)] }))).json<Order>()
    const b = (await post(order({ lines: [kopi()], payments: [cash(27500)] }))).json<Order>()
    expect(b.order_number).toBe(a.order_number + 1)
  })

  it('the same client_order_id ×5 (sequential) creates one order', async () => {
    const body = order({ lines: [kopi()], payments: [cash(27500, 50000)] })
    const before = await stockOf(t.app, s)
    const results = []
    for (let i = 0; i < 5; i++) results.push(await post(body))
    expect(results.map((r) => r.statusCode)).toEqual([201, 200, 200, 200, 200])
    expect(new Set(results.map((r) => r.json<Order>().id)).size).toBe(1)
    expect(results[4]?.json<Order>().change_due).toBe(22500)
    expect(Number(before.beans) - Number((await stockOf(t.app, s)).beans)).toBe(18)
  })

  it('the same client_order_id ×5 (parallel) creates one order and deducts once', async () => {
    const body = order({ lines: [kopi()], payments: [cash(27500)] })
    const before = await stockOf(t.app, s)
    const results = await Promise.all(Array.from({ length: 5 }, () => post(body)))
    expect(results.every((r) => r.statusCode === 200 || r.statusCode === 201)).toBe(true)
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1)
    expect(new Set(results.map((r) => r.json<Order>().id)).size).toBe(1)
    expect(Number(before.beans) - Number((await stockOf(t.app, s)).beans)).toBe(18)
    const count = await inTx(pool, s.tenantId, (c) =>
      c.query<{ n: bigint }>(`select count(*) as n from orders where client_order_id = $1`, [
        body.client_order_id,
      ]),
    )
    expect(count.rows[0]?.n).toBe(1n)
    expect(await invariant(t.app, s)).toEqual([])
  })
})

describe('server-side validation', () => {
  it('PRICE_CHANGED when the device total is stale, and nothing is stored', async () => {
    const body = order({ lines: [kopi()], payments: [cash(27500)], expected_total: 25000 })
    const before = await stockOf(t.app, s)
    const res = await post(body)
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({
      error: { code: 'PRICE_CHANGED', details: { total: 27500, expected_total: 25000 } },
    })
    expect(await stockOf(t.app, s)).toEqual(before)
    // The client can resubmit the same id with the new total.
    const retry = await post({ ...body, expected_total: 27500 })
    expect(retry.statusCode).toBe(201)
  })

  it.each([
    ['short payment', [cash(20000)], 'PAYMENT_MISMATCH'],
    ['over payment', [{ method: 'qris', amount: 30000 }], 'PAYMENT_MISMATCH'],
    ['no payment', [], 'PAYMENT_MISMATCH'],
    ['cash tendered below amount', [cash(27500, 20000)], 'VALIDATION'],
    ['cash without tendered (D-025)', [{ method: 'cash', amount: 27500 }], 'VALIDATION'],
    ['non-cash with tendered', [{ method: 'debit', amount: 27500, tendered: 27500 }], 'VALIDATION'],
    [
      'cash with a reference',
      [{ method: 'cash', amount: 27500, tendered: 27500, reference: 'x' }],
      'VALIDATION',
    ],
  ])('%s → %s', async (_, payments, code) => {
    const res = await post(order({ lines: [kopi()], payments }))
    expect(res.json()).toMatchObject({ error: { code } })
  })

  it('rejects a payment method the shop disabled', async () => {
    const other = await kopiShop(t.app, 'methods')
    await api(t.app, other.as.owner, 'PATCH', '/v1/settings', { enabled_payment_methods: ['cash'] })
    const res = await api(t.app, other.as.cashier, 'POST', '/v1/orders', {
      client_order_id: randomUUID(),
      order_type: 'takeaway',
      lines: [{ item_id: other.item.croissant, qty: 1 }],
      payments: [{ method: 'qris', amount: 24200 }],
    })
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION', details: { problem: 'payment_method_disabled' } },
    })
  })

  it('required groups must be chosen; counts must fit the group', async () => {
    const missing = await post(
      order({ lines: [kopi(1, [s.opt.regular, s.opt.normalSugar])], payments: [cash(25000)] }),
    )
    expect(missing.json()).toMatchObject({
      error: { code: 'VALIDATION', details: { problem: 'modifier_count' } },
    })
    const two = await post(
      order({
        lines: [kopi(1, [s.opt.regular, s.opt.large, s.opt.normalSugar, s.opt.freshMilk])],
        payments: [cash(30000)],
      }),
    )
    expect(two.json()).toMatchObject({ error: { details: { problem: 'modifier_count' } } })
  })

  it('options must belong to the item', async () => {
    const res = await post(
      order({
        lines: [{ item_id: s.item.croissant, qty: 1, option_ids: [s.opt.shot] }],
        payments: [cash(27000)],
      }),
    )
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION', details: { problem: 'option_not_on_item' } },
    })
  })

  it('sold-out, inactive or archived items → ITEM_UNAVAILABLE', async () => {
    await api(t.app, s.as.cashier, 'PATCH', `/v1/items/${s.item.croissant}/availability`, {
      is_available: false,
    })
    const res = await post(order({ lines: [{ item_id: s.item.croissant, qty: 1 }], payments: [cash(24200)] }))
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({
      error: { code: 'ITEM_UNAVAILABLE', details: { item_id: s.item.croissant } },
    })
    await api(t.app, s.as.cashier, 'PATCH', `/v1/items/${s.item.croissant}/availability`, {
      is_available: true,
    })
  })

  it('unknown ids → NOT_FOUND', async () => {
    const res = await post(order({ lines: [{ item_id: randomUUID(), qty: 1 }], payments: [] }))
    expect(res.statusCode).toBe(404)
  })

  it('rejects qty 0, 1000 and fractional', async () => {
    for (const qty of [0, 1000, 1.5]) {
      expect((await post(order({ lines: [kopi(qty)], payments: [] }))).statusCode).toBe(400)
    }
  })

  it('preset discounts must match their scope', async () => {
    const res = await post(
      order({ lines: [kopi()], order_discount: { discount_id: s.discount.item10 }, payments: [cash(24750)] }),
    )
    expect(res.json()).toMatchObject({ error: { details: { problem: 'discount_scope' } } })
  })

  it('a preset order discount applies before tax', async () => {
    const res = await post(
      order({
        lines: [kopi(2)],
        order_discount: { discount_id: s.discount.order5k },
        payments: [cash(49500)],
      }),
    )
    // 50 000 − 5 000 = 45 000 + 10 % = 49 500
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({
      net_sales: 45000,
      total: 49500,
      order_discount: { name: 'Potong 5rb', amount: 5000 },
    })
  })

  it('custom discounts: cashier forbidden, manager allowed and audited', async () => {
    const body = order({
      lines: [kopi()],
      order_discount: { kind: 'percent', value: 2000 },
      payments: [cash(22000)],
    })
    expect((await post(body)).statusCode).toBe(403)
    const res = await post(body, s.as.manager)
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({
      total: 22000,
      order_discount: { id: null, name: null, kind: 'percent', value: 2000 },
    })
    const audit = await auditActions(pool, s.tenantId)
    expect(
      audit.some((a) => a.action === 'order.custom_discount' && a.entity_id === res.json<Order>().id),
    ).toBe(true)
  })

  it('a fully discounted order needs no payment lines', async () => {
    const res = await post(
      order({ lines: [kopi()], order_discount: { kind: 'percent', value: 10000 }, payments: [] }),
      s.as.owner,
    )
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ total: 0, payments: [] })
  })

  it('employees cannot take orders', async () => {
    expect((await post(order({ lines: [kopi()], payments: [cash(27500)] }), s.as.employee)).statusCode).toBe(
      403,
    )
  })
})

describe('stock never blocks a sale', () => {
  it('sells into negative stock', async () => {
    const low = await kopiShop(t.app, 'negative', { stock: { croissant: '1' } })
    const sell = () =>
      api(t.app, low.as.cashier, 'POST', '/v1/orders', {
        client_order_id: randomUUID(),
        order_type: 'takeaway',
        lines: [{ item_id: low.item.croissant, qty: 3 }],
        payments: [cash(72600)],
      })
    expect((await sell()).statusCode).toBe(201)
    expect((await stockOf(t.app, low)).croissant).toBe('-2')
    expect(await invariant(t.app, low)).toEqual([])
  })
})
