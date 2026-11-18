// SPEC §10 outbox worker, and the M3 exit criterion: the low-stock email arrives
// in Mailpit exactly once per crossing.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Database } from '../../src/db/kysely.js'
import { MAX_ATTEMPTS, retryDelay } from '../../src/worker/backoff.js'
import { processBatch } from '../../src/worker/process.js'
import { smtpSender } from '../../src/worker/providers/smtp.js'
import type { EmailSender } from '../../src/worker/providers/types.js'
import { createTestApp, type TestApp } from '../support/app.js'
import { kopiShop } from '../support/kopi.js'
import { api } from '../support/menu.js'
import { ignoreIdleError, workerPool } from '../support/pg.js'

const env = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}
const MAILPIT = process.env['MAILPIT_API_URL'] ?? 'http://localhost:8025'
const FROM = 'ZuruPOS <no-reply@zurupos.local>'

let t: TestApp
let workerDb: Database
const worker = workerPool(1)

beforeAll(async () => {
  t = await createTestApp()
  workerDb = createDb(env('TEST_WORKER_DATABASE_URL'), 2, ignoreIdleError)
})
afterAll(async () => {
  await t.close()
  await workerDb.destroy()
  await worker.end()
})

// Runs batches until nothing is due (other test files may enqueue concurrently).
const drain = async (send: EmailSender) => {
  for (let i = 0; i < 50; i++) {
    const r = await processBatch(workerDb, send, { from: FROM })
    if (r.sent + r.retried + r.failed === 0) return
  }
}

const mailpitMessagesTo = async (address: string) => {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`)
  expect(res.ok).toBe(true)
  return (await res.json()) as { messages: { Subject: string; To: { Address: string }[] }[] }
}

describe('retryDelay (SPEC §10)', () => {
  it('backs off 1 m, 5 m, 30 m, 2 h, 6 h, then gives up', () => {
    expect([1, 2, 3, 4, 5, 6].map(retryDelay)).toEqual([
      60_000,
      300_000,
      1_800_000,
      7_200_000,
      21_600_000,
      null,
    ])
    expect(MAX_ATTEMPTS).toBe(6)
  })
})

describe('processBatch', () => {
  it('retries a failing send with backoff and marks it failed after 6 attempts', async () => {
    const shop = await kopiShop(t.app, 'retry')
    const address = `bounce-${randomUUID().slice(0, 8)}@test.zurupos.local`
    await api(t.app, shop.as.owner, 'PATCH', '/v1/settings', { alert_extra_emails: [address] })
    await api(t.app, shop.as.owner, 'PATCH', `/v1/ingredients/${shop.ing.croissant}`, {
      low_stock_threshold: '25',
    })
    // Selling one croissant crosses the threshold (20 → 19 ≤ 25).
    await api(t.app, shop.as.cashier, 'POST', '/v1/orders', {
      client_order_id: randomUUID(),
      order_type: 'takeaway',
      lines: [{ item_id: shop.item.croissant, qty: 1 }],
      payments: [{ method: 'qris', amount: 24200 }],
    })
    // Fails only for this test's email; everything else is "sent" without sending.
    const send: EmailSender = async (email) => {
      if (email.to.includes(address)) throw new Error('mailbox unavailable')
    }
    const row = async () =>
      (
        await worker.query<{ status: string; attempts: number; last_error: string | null; due_in: number }>(
          `select status, attempts, last_error, extract(epoch from next_attempt_at - now())::int as due_in
           from outbox where $1 = any (to_addresses)`,
          [address],
        )
      ).rows[0]

    await drain(send)
    expect(await row()).toMatchObject({ status: 'pending', attempts: 1, last_error: 'mailbox unavailable' })
    expect((await row())?.due_in).toBeGreaterThan(50)

    for (let i = 2; i <= 6; i++) {
      await worker.query(`update outbox set next_attempt_at = now() where $1 = any (to_addresses)`, [address])
      await drain(send)
    }
    expect(await row()).toMatchObject({ status: 'failed', attempts: 6 })
  })
})

describe('low-stock email in Mailpit', () => {
  it('arrives exactly once per crossing', async () => {
    const shop = await kopiShop(t.app, 'mailpit', { stock: { croissant: '10' } })
    await api(t.app, shop.as.owner, 'PATCH', `/v1/ingredients/${shop.ing.croissant}`, {
      low_stock_threshold: '5',
    })
    const sell = (qty: number) =>
      api(t.app, shop.as.cashier, 'POST', '/v1/orders', {
        client_order_id: randomUUID(),
        order_type: 'takeaway',
        lines: [{ item_id: shop.item.croissant, qty }],
        payments: [{ method: 'qris', amount: 24200 * qty }],
      })
    const send = smtpSender(env('SMTP_URL'))
    const owner = shop.owner.email.toLowerCase()

    await sell(6) // 10 → 4: crossing
    await sell(1) // 3: no new alert
    await drain(send)
    let inbox = await mailpitMessagesTo(owner)
    expect(inbox.messages.map((m) => m.Subject)).toEqual(['[ZuruPOS] Stok menipis: Croissant'])

    await api(t.app, shop.as.owner, 'POST', '/v1/stock/in', {
      ingredient_id: shop.ing.croissant,
      qty: '10',
      total_cost: 1,
    })
    await sell(9) // 13 → 4: second crossing
    await drain(send)
    inbox = await mailpitMessagesTo(owner)
    expect(inbox.messages).toHaveLength(2)
  })
})
