// GET /v1/orders/today and GET /v1/orders/:id — who sees what (PRD §6, SPEC §5.5).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '../support/app.js'
import { kopiShop, plainKopi, type KopiShop } from '../support/kopi.js'
import { api } from '../support/menu.js'
import { appPool, inTx } from '../support/pg.js'

let t: TestApp
let s: KopiShop
let orderId: string
const pool = appPool(1)

beforeAll(async () => {
  t = await createTestApp()
  s = await kopiShop(t.app, 'reads')
  const res = await api(t.app, s.as.cashier, 'POST', '/v1/orders', {
    client_order_id: randomUUID(),
    order_type: 'dine_in',
    customer_name: 'Budi',
    lines: [{ item_id: s.item.kopiSusu, qty: 1, option_ids: plainKopi(s) }],
    payments: [{ method: 'cash', amount: 27500, tendered: 30000 }],
  })
  orderId = res.json<{ id: string }>().id
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

describe('GET /orders/today', () => {
  it('lists today’s orders with items and payment methods', async () => {
    const res = await api(t.app, s.as.cashier, 'GET', '/v1/orders/today')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      orders: [
        {
          id: orderId,
          customer_name: 'Budi',
          total: 27500,
          items: [{ name: 'Kopi Susu Gula Aren', qty: 1, modifiers: ['Regular', 'Normal', 'Susu segar'] }],
          payment_methods: ['cash'],
        },
      ],
    })
  })

  it('employees see the total but no payment details', async () => {
    const res = await api(t.app, s.as.employee, 'GET', '/v1/orders/today')
    expect(res.statusCode).toBe(200)
    expect(res.json<{ orders: { total: number }[] }>().orders[0]?.total).toBe(27500)
    expect(res.body).not.toContain('payment_methods')
    expect(res.body).not.toContain('tendered')
  })
})

describe('GET /orders/:id', () => {
  it('cashiers read today’s orders without costs; owners see COGS', async () => {
    const cashier = await api(t.app, s.as.cashier, 'GET', `/v1/orders/${orderId}`)
    expect(cashier.statusCode).toBe(200)
    expect(cashier.body).not.toContain('cogs')
    const owner = await api(t.app, s.as.owner, 'GET', `/v1/orders/${orderId}`)
    expect(owner.json()).toMatchObject({ cogs_total: 1900, change_due: 2500 })
  })

  it('employees cannot open order details', async () => {
    expect((await api(t.app, s.as.employee, 'GET', `/v1/orders/${orderId}`)).statusCode).toBe(403)
  })

  it('only the owner reads orders from earlier days', async () => {
    await inTx(pool, s.tenantId, (c) =>
      c.query(`update orders set business_date = business_date - 1 where id = $1`, [orderId]),
    )
    expect((await api(t.app, s.as.cashier, 'GET', `/v1/orders/${orderId}`)).statusCode).toBe(404)
    expect((await api(t.app, s.as.manager, 'GET', `/v1/orders/${orderId}`)).statusCode).toBe(404)
    expect((await api(t.app, s.as.owner, 'GET', `/v1/orders/${orderId}`)).statusCode).toBe(200)
  })
})

describe('GET /admin/stock-invariant', () => {
  it('is owner-only and empty when every change went through the ledger', async () => {
    expect((await api(t.app, s.as.owner, 'GET', '/v1/admin/stock-invariant')).json()).toEqual({
      mismatches: [],
    })
    expect((await api(t.app, s.as.manager, 'GET', '/v1/admin/stock-invariant')).statusCode).toBe(403)
  })

  it('reports a stock change made outside the ledger', async () => {
    await inTx(pool, s.tenantId, (c) =>
      c.query(`update ingredients set stock_qty = stock_qty + 1 where id = $1`, [s.ing.lid]),
    )
    const res = await api(t.app, s.as.owner, 'GET', '/v1/admin/stock-invariant')
    expect(res.json()).toMatchObject({ mismatches: [{ ingredient_id: s.ing.lid, name: 'Tutup' }] })
    await inTx(pool, s.tenantId, (c) =>
      c.query(`update ingredients set stock_qty = stock_qty - 1 where id = $1`, [s.ing.lid]),
    )
  })
})
