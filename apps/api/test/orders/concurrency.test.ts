// M3 exit criterion: 20 parallel orders on the same ingredients → exact final
// stock, no deadlocks, unique order numbers, stock invariant holds.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '../support/app.js'
import { invariant, kopiShop, stockOf, type KopiShop } from '../support/kopi.js'
import { api } from '../support/menu.js'

let t: TestApp
let s: KopiShop

beforeAll(async () => {
  // A pool big enough that the 20 requests really run concurrently in Postgres.
  t = await createTestApp({ poolMax: 20 })
  s = await kopiShop(t.app, 'concurrency')
})
afterAll(() => t.close())

describe('20 parallel orders', () => {
  it('deduct exactly, never deadlock, and get unique numbers', async () => {
    const before = await stockOf(t.app, s)
    const kopi = {
      item_id: s.item.kopiSusu,
      qty: 1,
      option_ids: [s.opt.large, s.opt.normalSugar, s.opt.oat, s.opt.shot],
    }
    const croissant = { item_id: s.item.croissant, qty: 1 }
    // Lines in opposite orders, so without ordered locking two orders would take
    // the same ingredient rows in different orders.
    const requests = Array.from({ length: 20 }, (_, i) =>
      api(t.app, s.as.cashier, 'POST', '/v1/orders', {
        client_order_id: randomUUID(),
        order_type: 'takeaway',
        lines: i % 2 === 0 ? [kopi, croissant] : [croissant, kopi],
        // (25 000 + 5 000 + 6 000 + 5 000) + 22 000 = 63 000, + PB1 10 %
        payments: [{ method: 'qris', amount: 69300 }],
      }),
    )
    const results = await Promise.all(requests)
    expect(results.map((r) => r.statusCode)).toEqual(Array.from({ length: 20 }, () => 201))

    const numbers = results.map((r) => r.json<{ order_number: number }>().order_number).sort((a, b) => a - b)
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))

    // Per order: beans 36, oat 200, aren 20, cup16 1, lid 1, croissant 1.
    const after = await stockOf(t.app, s)
    const used = (k: keyof typeof after) => Number(before[k]) - Number(after[k])
    expect({
      beans: used('beans'),
      oat: used('oat'),
      aren: used('aren'),
      cup16: used('cup16'),
      lid: used('lid'),
      croissant: used('croissant'),
      milk: used('milk'),
      cup12: used('cup12'),
    }).toEqual({ beans: 720, oat: 4000, aren: 400, cup16: 20, lid: 20, croissant: 20, milk: 0, cup12: 0 })
    expect(await invariant(t.app, s)).toEqual([])
  })
})
