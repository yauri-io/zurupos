// SPEC §7.4: stock-in (weighted average), waste and stock count.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '../support/app.js'
import { invariant, kopiShop, stockOf, type KopiShop } from '../support/kopi.js'
import { api, createIngredient } from '../support/menu.js'
import { appPool, inTx } from '../support/pg.js'
import { auditActions } from '../support/roles.js'

let t: TestApp
let s: KopiShop
const pool = appPool(1)

beforeAll(async () => {
  t = await createTestApp()
  s = await kopiShop(t.app, 'stock')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

type Result = { ingredients: { id: string; stock_qty: string; avg_cost?: string }[] }
const first = (r: { json: () => unknown }) => (r.json() as Result).ingredients[0]

describe('stock-in', () => {
  it('updates stock and the weighted average cost', async () => {
    const id = (await createIngredient(t.app, s.as.owner, 'Teh', 'g')).id
    const a = await api(t.app, s.as.owner, 'POST', '/v1/stock/in', {
      ingredient_id: id,
      qty: '1000',
      total_cost: 200000,
    })
    expect(first(a)).toMatchObject({ stock_qty: '1000', avg_cost: '200' })
    const b = await api(t.app, s.as.owner, 'POST', '/v1/stock/in', {
      ingredient_id: id,
      qty: '1000',
      total_cost: 260000,
    })
    expect(first(b)).toMatchObject({ stock_qty: '2000', avg_cost: '230' })
  })

  it('accepts purchase units', async () => {
    const id = (
      await createIngredient(t.app, s.as.owner, 'Susu UHT', 'ml', {
        purchase_unit_name: 'Karton',
        purchase_unit_size: '12000',
      })
    ).id
    const res = await api(t.app, s.as.manager, 'POST', '/v1/stock/in', {
      ingredient_id: id,
      purchase_qty: '2.5',
      total_cost: 540000,
    })
    expect(res.statusCode, res.body).toBe(200)
    // Managers don't see costs.
    expect(first(res)).toEqual(expect.objectContaining({ stock_qty: '30000' }))
    expect(first(res)).not.toHaveProperty('avg_cost')
    const owner = await api(t.app, s.as.owner, 'GET', `/v1/ingredients/${id}`)
    expect(owner.json()).toMatchObject({ avg_cost: '18' })
  })

  it.each([
    [{ qty: '1', purchase_qty: '1' }, 'qty_or_purchase_qty'],
    [{}, 'qty_or_purchase_qty'],
    [{ qty: '0' }, 'must_be_positive'],
    [{ purchase_qty: '1' }, 'no_purchase_unit'],
  ])('rejects %o', async (body, problem) => {
    const res = await api(t.app, s.as.owner, 'POST', '/v1/stock/in', {
      ingredient_id: s.ing.beans,
      total_cost: 1,
      ...body,
    })
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION', details: { problem } } })
  })
})

describe('waste', () => {
  it('reduces stock at average cost and keeps the reason', async () => {
    const before = await stockOf(t.app, s)
    const res = await api(t.app, s.as.employee, 'POST', '/v1/stock/waste', {
      ingredient_id: s.ing.milk,
      qty: '250',
      reason: 'spilled',
      note: 'tumpah di bar',
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(Number(before.milk) - Number(first(res)?.stock_qty)).toBe(250)
    const m = await inTx(pool, s.tenantId, (c) =>
      c.query<{ reason: string; qty_delta: string }>(
        `select reason, qty_delta from stock_movements where ingredient_id = $1 and type = 'waste'`,
        [s.ing.milk],
      ),
    )
    expect(m.rows).toEqual([{ reason: 'spilled: tumpah di bar', qty_delta: '-250.000' }])
  })

  it('rejects unknown reasons', async () => {
    const res = await api(t.app, s.as.owner, 'POST', '/v1/stock/waste', {
      ingredient_id: s.ing.milk,
      qty: '1',
      reason: 'lost',
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('stock count', () => {
  it('records adjustments only where the count differs, with one audit entry', async () => {
    const before = await stockOf(t.app, s)
    const res = await api(t.app, s.as.employee, 'POST', '/v1/stock/count', {
      counts: [
        { ingredient_id: s.ing.cup12, counted_qty: before.cup12 },
        { ingredient_id: s.ing.lid, counted_qty: '350' },
        { ingredient_id: s.ing.aren, counted_qty: '2750.5' },
      ],
      note: 'opname mingguan',
    })
    expect(res.statusCode, res.body).toBe(200)
    const after = await stockOf(t.app, s)
    expect(after).toMatchObject({ cup12: before.cup12, lid: '350', aren: '2750.5' })
    const m = await inTx(pool, s.tenantId, (c) =>
      c.query<{ ingredient_id: string; counted_qty: string }>(
        `select ingredient_id, counted_qty from stock_movements where type = 'count_adjust' order by ingredient_id`,
      ),
    )
    expect(m.rows.map((r) => r.ingredient_id).sort()).toEqual([s.ing.aren, s.ing.lid].sort())
    const audit = (await auditActions(pool, s.tenantId)).filter((a) => a.action === 'stock.count')
    expect(audit).toHaveLength(1)
    expect(await invariant(t.app, s)).toEqual([])
  })

  it('rejects duplicates and negative counts', async () => {
    const dup = await api(t.app, s.as.owner, 'POST', '/v1/stock/count', {
      counts: [
        { ingredient_id: s.ing.lid, counted_qty: '1' },
        { ingredient_id: s.ing.lid, counted_qty: '2' },
      ],
    })
    expect(dup.statusCode).toBe(400)
    const neg = await api(t.app, s.as.owner, 'POST', '/v1/stock/count', {
      counts: [{ ingredient_id: s.ing.lid, counted_qty: '-1' }],
    })
    expect(neg.statusCode).toBe(400)
  })
})

describe('permissions (PRD §6)', () => {
  it('cashiers cannot adjust stock', async () => {
    for (const path of ['/v1/stock/in', '/v1/stock/waste', '/v1/stock/count']) {
      expect((await api(t.app, s.as.cashier, 'POST', path, {})).statusCode).toBe(403)
    }
  })
})
