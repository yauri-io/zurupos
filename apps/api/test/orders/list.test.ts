// GET /v1/orders (owner): business-date range, filters, keyset pagination (SPEC §9, D-034).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, expectStatus, type TestApp } from '../support/app.js'
import { kopiShop, plainKopi, type KopiShop } from '../support/kopi.js'
import { api } from '../support/menu.js'
import { appPool, inTx } from '../support/pg.js'

type Listed = {
  id: string
  order_number: number
  status: string
  business_date: string
  customer_name: string | null
}
type Page = { orders: Listed[]; next_cursor: string | null }

let t: TestApp
let s: KopiShop
const pool = appPool(1)
const ids: string[] = []

beforeAll(async () => {
  t = await createTestApp()
  s = await kopiShop(t.app, 'order-list')
  const make = async (
    creds: typeof s.as.cashier,
    customer: string,
    item: 'kopi' | 'croissant',
    method: 'cash' | 'qris',
  ) => {
    const line =
      item === 'kopi'
        ? { item_id: s.item.kopiSusu, qty: 1, option_ids: plainKopi(s) }
        : { item_id: s.item.croissant, qty: 1 }
    const total = item === 'kopi' ? 27500 : 24200
    const res = expectStatus(
      await api(t.app, creds, 'POST', '/v1/orders', {
        client_order_id: randomUUID(),
        order_type: 'takeaway',
        customer_name: customer,
        lines: [line],
        payments: [
          method === 'cash' ? { method, amount: total, tendered: total } : { method, amount: total },
        ],
      }),
      201,
    )
    ids.push(res.json<{ id: string }>().id)
  }
  await make(s.as.cashier, 'Dina', 'kopi', 'cash') // 0 → 2026-11-02
  await make(s.as.cashier, 'Budi', 'croissant', 'qris') // 1 → 2026-11-02
  await make(s.as.manager, 'Dina Ayu', 'kopi', 'qris') // 2 → 2026-11-03, voided
  await make(s.as.cashier, '50% off guy', 'croissant', 'cash') // 3 → 2026-11-03
  await make(s.as.cashier, 'Sari', 'kopi', 'cash') // 4 → 2026-11-04
  expectStatus(
    await api(t.app, s.as.owner, 'POST', `/v1/orders/${ids[2]}/void`, { reason: 'x', restock: false }),
    200,
  )
  const days = [
    '2026-11-02 08:00',
    '2026-11-02 09:00',
    '2026-11-03 10:00',
    '2026-11-03 11:00',
    '2026-11-04 12:00',
  ]
  await inTx(pool, s.tenantId, async (c) => {
    for (const [i, day] of days.entries()) {
      await c.query(
        `update orders set paid_at = ($2::timestamp at time zone 'Asia/Jakarta'), business_date = $2::date where id = $1`,
        [ids[i], day],
      )
    }
  })
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

const list = async (query: string) =>
  expectStatus(await api(t.app, s.as.owner, 'GET', `/v1/orders?${query}`), 200).json<Page>()
const idx = (page: Page) => page.orders.map((o) => ids.indexOf(o.id))

describe('GET /orders', () => {
  it('lists the range newest first, with items, totals and payment methods', async () => {
    const page = await list('from=2026-11-02&to=2026-11-03')
    expect(idx(page)).toEqual([3, 2, 1, 0])
    expect(page.next_cursor).toBeNull()
    expect(page.orders[3]).toMatchObject({
      business_date: '2026-11-02',
      customer_name: 'Dina',
      total: 27500,
      payment_methods: ['cash'],
      items: [{ name: 'Kopi Susu Gula Aren', qty: 1 }],
    })
  })

  it.each([
    ['status=voided', [2]],
    ['status=paid', [4, 3, 1, 0]],
    ['method=qris', [2, 1]],
    ['q=dina', [2, 0]],
    ['q=croissant', [3, 1]],
    ['q=50%25', [3]], // "50%" matches literally, not as a wildcard
    ['q=_', []],
  ])('%s', async (filter, expected) => {
    expect(idx(await list(`from=2026-11-01&to=2026-11-30&${filter}`))).toEqual(expected)
  })

  it('filters by order number and by who took the order', async () => {
    const all = await list('from=2026-11-01&to=2026-11-30')
    const third = all.orders.find((o) => o.id === ids[3])
    expect(idx(await list(`from=2026-11-01&to=2026-11-30&q=${third?.order_number}`))).toContain(3)
    expect(idx(await list(`from=2026-11-01&to=2026-11-30&user_id=${s.users.manager.id}`))).toEqual([2])
  })

  it('pages with a cursor without skipping or repeating', async () => {
    const first = await list('from=2026-11-01&to=2026-11-30&limit=2')
    expect(idx(first)).toEqual([4, 3])
    const second = await list(`from=2026-11-01&to=2026-11-30&limit=2&cursor=${first.next_cursor}`)
    expect(idx(second)).toEqual([2, 1])
    const third = await list(`from=2026-11-01&to=2026-11-30&limit=2&cursor=${second.next_cursor}`)
    expect(idx(third)).toEqual([0])
    expect(third.next_cursor).toBeNull()
  })

  it('validates the range and cursor', async () => {
    for (const q of [
      'from=2026-11-04&to=2026-11-01',
      'to=2026-11-01',
      'from=2026-11-01&to=2026-11-02&cursor=nope',
    ]) {
      expect((await api(t.app, s.as.owner, 'GET', `/v1/orders?${q}`)).statusCode, q).toBe(400)
    }
  })

  it.each(['manager', 'cashier', 'employee'] as const)('%s gets 403', async (role) => {
    expect((await api(t.app, s.as[role], 'GET', '/v1/orders?from=2026-11-01&to=2026-11-30')).statusCode).toBe(
      403,
    )
  })
})
