// SPEC §8 / PRD F13: one email per crossing, re-armed above the threshold, one
// combined email for ingredients crossing together, enqueued in the same transaction.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '../support/app.js'
import { kopiShop, type KopiShop } from '../support/kopi.js'
import { api } from '../support/menu.js'
import { workerPool } from '../support/pg.js'

let t: TestApp
const worker = workerPool(1)

beforeAll(async () => {
  t = await createTestApp()
})
afterAll(async () => {
  await t.close()
  await worker.end()
})

const lowStockEmails = async (tenantId: string) =>
  (
    await worker.query<{ subject: string; text: string; to_addresses: string[] }>(
      `select subject, text, to_addresses from outbox where tenant_id = $1 and kind = 'low_stock' order by created_at`,
      [tenantId],
    )
  ).rows

const sellCroissants = (s: KopiShop, qty: number) =>
  api(t.app, s.as.cashier, 'POST', '/v1/orders', {
    client_order_id: randomUUID(),
    order_type: 'takeaway',
    lines: [{ item_id: s.item.croissant, qty }],
    payments: [{ method: 'qris', amount: 24200 * qty }],
  })

const threshold = (s: KopiShop, id: string, value: string) =>
  api(t.app, s.as.owner, 'PATCH', `/v1/ingredients/${id}`, { low_stock_threshold: value })

describe('low-stock alerts', () => {
  it('alerts once per crossing and re-arms after a stock-in above the threshold', async () => {
    const s = await kopiShop(t.app, 'lowstock', { stock: { croissant: '10' } })
    await threshold(s, s.ing.croissant, '5')

    expect((await sellCroissants(s, 4)).statusCode).toBe(201) // 6 left: above
    expect(await lowStockEmails(s.tenantId)).toHaveLength(0)
    await sellCroissants(s, 1) // 5 left: at threshold → crossing
    const [mail] = await lowStockEmails(s.tenantId)
    expect(mail?.subject).toBe('[ZuruPOS] Stok menipis: Croissant')
    expect(mail?.text).toContain('Croissant: 5 pcs (batas 5 pcs)')
    expect(mail?.to_addresses).toEqual([s.owner.email.toLowerCase()])

    await sellCroissants(s, 2) // still below: no repeat
    await sellCroissants(s, 5) // negative: no repeat
    expect(await lowStockEmails(s.tenantId)).toHaveLength(1)

    await api(t.app, s.as.owner, 'POST', '/v1/stock/in', {
      ingredient_id: s.ing.croissant,
      qty: '20',
      total_cost: 200000,
    })
    await sellCroissants(s, 10) // 18 → 8: above, still armed
    expect(await lowStockEmails(s.tenantId)).toHaveLength(1)
    await sellCroissants(s, 3) // 5: crossing again
    expect(await lowStockEmails(s.tenantId)).toHaveLength(2)
  })

  it('ingredients crossing in one order share one email; extra recipients are added', async () => {
    const s = await kopiShop(t.app, 'combined', { stock: { beans: '40', lid: '3' } })
    await threshold(s, s.ing.beans, '20')
    await threshold(s, s.ing.lid, '2')
    await api(t.app, s.as.owner, 'PATCH', '/v1/settings', { alert_extra_emails: ['gudang@example.com'] })
    const res = await api(t.app, s.as.cashier, 'POST', '/v1/orders', {
      client_order_id: randomUUID(),
      order_type: 'takeaway',
      lines: [
        {
          item_id: s.item.kopiSusu,
          qty: 1,
          option_ids: [s.opt.regular, s.opt.normalSugar, s.opt.freshMilk, s.opt.shot],
        },
      ],
      payments: [{ method: 'qris', amount: 33000 }],
    })
    expect(res.statusCode, res.body).toBe(201)
    const mails = await lowStockEmails(s.tenantId)
    expect(mails).toHaveLength(1)
    expect(mails[0]?.subject).toBe('[ZuruPOS] Stok menipis: Biji Kopi, Tutup')
    expect(mails[0]?.to_addresses.sort()).toEqual(['gudang@example.com', s.owner.email.toLowerCase()].sort())
  })

  it('a void with restock re-arms; disabled alerts send nothing', async () => {
    const s = await kopiShop(t.app, 'rearm', { stock: { croissant: '6' } })
    await threshold(s, s.ing.croissant, '5')
    const sold = (await sellCroissants(s, 1)).json<{ id: string }>().id // 5 → alert
    expect(await lowStockEmails(s.tenantId)).toHaveLength(1)
    await api(t.app, s.as.manager, 'POST', `/v1/orders/${sold}/void`, { reason: 'batal', restock: true }) // 6 → re-armed
    await api(t.app, s.as.owner, 'PATCH', '/v1/settings', { low_stock_alerts_enabled: false })
    await sellCroissants(s, 1) // crossing, but alerts are off
    expect(await lowStockEmails(s.tenantId)).toHaveLength(1)
  })

  it('a zero threshold never alerts', async () => {
    const s = await kopiShop(t.app, 'nothreshold', { stock: { croissant: '1' } })
    await sellCroissants(s, 3)
    expect(await lowStockEmails(s.tenantId)).toHaveLength(0)
  })
})
