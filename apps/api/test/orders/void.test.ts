// POST /v1/orders/:id/void — SPEC §7.3, approval §5.4.
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
  s = await kopiShop(t.app, 'void')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

const sell = async () => {
  const res = await api(t.app, s.as.cashier, 'POST', '/v1/orders', {
    client_order_id: randomUUID(),
    order_type: 'dine_in',
    lines: [{ item_id: s.item.kopiSusu, qty: 2, option_ids: plainKopi(s) }],
    payments: [{ method: 'cash', amount: 55000, tendered: 60000 }],
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json<{ id: string }>().id
}

const voidIt = (id: string, body: Json, creds = s.as.manager) =>
  api(t.app, creds, 'POST', `/v1/orders/${id}/void`, body)

describe('void by owner or manager', () => {
  it('restock = yes returns stock at the original unit cost', async () => {
    const before = await stockOf(t.app, s)
    const id = await sell()
    const res = await voidIt(id, { reason: 'Salah pesanan', restock: true })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({
      status: 'voided',
      void: {
        reason: 'Salah pesanan',
        restock: true,
        approved_by: null,
        voided_by: { id: s.users.manager.id },
      },
    })
    expect(await stockOf(t.app, s)).toEqual(before)
    const movements = await inTx(pool, s.tenantId, (c) =>
      c.query<{ type: string; unit_cost: string }>(
        `select type, unit_cost from stock_movements where order_id = $1 order by type`,
        [id],
      ),
    )
    expect(movements.rows.filter((m) => m.type === 'void_return')).toHaveLength(5)
    expect(new Set(movements.rows.map((m) => m.unit_cost))).toEqual(new Set(['10.0000']))
    expect(await invariant(t.app, s)).toEqual([])
    expect(
      (await auditActions(pool, s.tenantId)).some((a) => a.action === 'order.void' && a.entity_id === id),
    ).toBe(true)
  })

  it('restock = no keeps the stock deducted', async () => {
    const before = await stockOf(t.app, s)
    const id = await sell()
    expect((await voidIt(id, { reason: 'Sudah dibuat', restock: false })).statusCode).toBe(200)
    expect(Number(before.beans) - Number((await stockOf(t.app, s)).beans)).toBe(36)
  })

  it('an order can be voided once', async () => {
    const id = await sell()
    await voidIt(id, { reason: 'x', restock: true })
    const again = await voidIt(id, { reason: 'x', restock: true })
    expect(again.statusCode).toBe(409)
  })

  it('needs a reason', async () => {
    expect((await voidIt(await sell(), { reason: '  ', restock: true })).statusCode).toBe(400)
  })
})

describe('cashier void with manager approval (SPEC §5.4)', () => {
  it('without approval → FORBIDDEN', async () => {
    const res = await voidIt(await sell(), { reason: 'x', restock: true }, s.as.cashier)
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: { details: { reason: 'approval_required' } } })
  })

  it('with the manager’s PIN → voided and the approver recorded', async () => {
    const res = await voidIt(
      await sell(),
      {
        reason: 'Pelanggan batal',
        restock: true,
        approval: { user_id: s.users.manager.id, pin: s.users.manager.pin },
      },
      s.as.cashier,
    )
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({
      void: { approved_by: { id: s.users.manager.id }, voided_by: { id: s.users.cashier.id } },
    })
  })

  it('another cashier cannot approve', async () => {
    const res = await voidIt(
      await sell(),
      { reason: 'x', restock: true, approval: { user_id: s.users.cashier.id, pin: s.users.cashier.pin } },
      s.as.cashier,
    )
    expect(res.json()).toMatchObject({
      error: { code: 'FORBIDDEN', details: { reason: 'approver_not_allowed' } },
    })
  })

  it('wrong approval PINs count towards the lockout and are not rolled back', async () => {
    const shop = await kopiShop(t.app, 'void-lock')
    const id = await (async () => {
      const res = await api(t.app, shop.as.cashier, 'POST', '/v1/orders', {
        client_order_id: randomUUID(),
        order_type: 'takeaway',
        lines: [{ item_id: shop.item.croissant, qty: 1 }],
        payments: [{ method: 'qris', amount: 24200 }],
      })
      return res.json<{ id: string }>().id
    })()
    const attempt = (pin: string) =>
      api(t.app, shop.as.cashier, 'POST', `/v1/orders/${id}/void`, {
        reason: 'x',
        restock: true,
        approval: { user_id: shop.users.manager.id, pin },
      })
    for (let i = 0; i < 4; i++) {
      const res = await attempt('0000')
      expect(res.json()).toMatchObject({
        error: { code: 'FORBIDDEN', details: { reason: 'approval_invalid_pin' } },
      })
    }
    expect((await attempt('0000')).json()).toMatchObject({ error: { code: 'PIN_LOCKED' } })
    // Even the right PIN is refused while locked; the order stays paid.
    expect((await attempt(shop.users.manager.pin)).json()).toMatchObject({ error: { code: 'PIN_LOCKED' } })
    const order = await api(t.app, shop.as.owner, 'GET', `/v1/orders/${id}`)
    expect(order.json()).toMatchObject({ status: 'paid' })
  })

  it('employees cannot void', async () => {
    expect((await voidIt(await sell(), { reason: 'x', restock: true }, s.as.employee)).statusCode).toBe(403)
  })
})
