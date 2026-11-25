// SPEC §12.6 report emails, end to end against real Postgres: the scheduler finds
// the shops through auth.report_schedule() (D-075), works in each shop's tenant
// transaction and queues the email in the outbox. Read back as zuru_worker.
//
// Kopi shops in Asia/Jakarta. Every order is Croissants at Rp 22.000 net (PB1 10%).
//   main:  Wed 2026-11-25: 3 orders (1, 2 and 1 croissant) → Rp 88.000 net, 3 orders,
//          average Rp 29.333; one more order voided (Rp 24.200 total).
//          Wed 2026-11-18 (a week earlier): 1 order of 2 → Rp 44.000 → +100 %.
//          Weekly 23–29 Nov: the 3 orders; week before 16–22 Nov: the 18th's order.
//   other: Wed 2026-11-25: 1 order of 5 → Rp 110.000 (must never show in main's email).
//   quiet: no orders at all.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Database } from '../../src/db/kysely.js'
import { reportSchedule, type ScheduleRow } from '../../src/scheduler/queries.js'
import { runForShops } from '../../src/scheduler/run.js'
import { createTestApp, expectStatus, type TestApp } from '../support/app.js'
import { kopiShop, type KopiShop } from '../support/kopi.js'
import { api } from '../support/menu.js'
import { appPool, ignoreIdleError, inTx } from '../support/pg.js'

let t: TestApp
let workerDb: Database
const pool = appPool(2)
let main: KopiShop
let other: KopiShop
let quiet: KopiShop
let parallel: KopiShop

const DASH = 'https://app.test'
// A UTC instant for a Jakarta wall-clock time.
const wib = (local: string) => new Date(new Date(`${local}:00Z`).getTime() - 7 * 3_600_000)

const sell = async (s: KopiShop, qty: number, day: string, time = '10:00') => {
  const res = expectStatus(
    await api(t.app, s.as.cashier, 'POST', '/v1/orders', {
      client_order_id: randomUUID(),
      order_type: 'takeaway',
      lines: [{ item_id: s.item.croissant, qty }],
      payments: [{ method: 'qris', amount: qty * 24200 }],
    }),
    201,
  )
  const id = res.json<{ id: string }>().id
  await inTx(pool, s.tenantId, (c) =>
    c.query(
      `update orders set business_date = $2::date, paid_at = ($2 || ' ' || $3)::timestamp at time zone 'Asia/Jakarta' where id = $1`,
      [id, day, time],
    ),
  )
  return id
}

// The real schedule rows, narrowed to this file's shops.
const scheduleFor = async (...shops: KopiShop[]): Promise<ScheduleRow[]> => {
  const ids = new Set(shops.map((s) => s.tenantId))
  return (await reportSchedule(t.db)).filter((r) => ids.has(r.tenant_id))
}
const errors: unknown[] = []
const pass = async (now: Date, ...shops: KopiShop[]) =>
  runForShops(t.db, await scheduleFor(...shops), {
    now,
    dashboardUrl: DASH,
    onError: (err) => errors.push(err),
  })

type Email = { kind: string; to_addresses: string[]; subject: string; text: string; html: string }
const emailsOf = async (s: KopiShop): Promise<Email[]> =>
  workerDb
    .selectFrom('outbox')
    .select(['kind', 'to_addresses', 'subject', 'text', 'html'])
    .where('tenant_id', '=', s.tenantId)
    .where('kind', 'in', ['daily_summary', 'weekly_summary'])
    .orderBy('created_at')
    .execute()

beforeAll(async () => {
  t = await createTestApp()
  const url = process.env['TEST_WORKER_DATABASE_URL']
  if (!url) throw new Error('TEST_WORKER_DATABASE_URL is not set')
  workerDb = createDb(url, 2, ignoreIdleError)
  main = await kopiShop(t.app, 'report-main')
  other = await kopiShop(t.app, 'report-other')
  quiet = await kopiShop(t.app, 'report-quiet')
  parallel = await kopiShop(t.app, 'report-parallel')
  // Extra alert addresses get low-stock emails, never these (D-074).
  expectStatus(
    await api(t.app, main.as.owner, 'PATCH', '/v1/settings', {
      alert_extra_emails: ['barista@test.zurupos.local'],
    }),
    200,
  )
  await sell(main, 1, '2026-11-25', '08:15')
  await sell(main, 2, '2026-11-25', '13:00')
  await sell(main, 1, '2026-11-25', '16:40')
  const voided = await sell(main, 1, '2026-11-25', '17:00')
  expectStatus(
    await api(t.app, main.as.owner, 'POST', `/v1/orders/${voided}/void`, {
      reason: 'Salah input',
      restock: true,
    }),
    200,
  )
  await sell(main, 2, '2026-11-18')
  await sell(other, 5, '2026-11-25')
  await sell(parallel, 1, '2026-11-25')
})
afterAll(async () => {
  await t.close()
  await workerDb.destroy()
  await pool.end()
})

describe('daily summary (07:00 for the previous business day)', () => {
  it('queues one email to the owner only, with only this shop’s figures', async () => {
    const r = await pass(wib('2026-11-26T08:00'), main, other)
    expect(r).toEqual({ sent: 2, already_sent: 0, no_owner: 0, skipped_empty: 0, failed: 0 })
    const [email, ...rest] = await emailsOf(main)
    expect(rest).toEqual([])
    expect(email?.kind).toBe('daily_summary')
    expect(email?.to_addresses).toEqual([main.owner.email.toLowerCase()])
    expect(email?.subject).toBe('[ZuruPOS] Ringkasan Rabu, 25 Nov: Rp 88.000')
    expect(email?.text).toContain('Penjualan bersih: Rp 88.000')
    expect(email?.text).toContain('Pesanan: 3 · Rata-rata per pesanan: Rp 29.333')
    expect(email?.text).toContain('+100% dibanding minggu lalu di hari yang sama')
    expect(email?.text).toContain('Minggu lalu di hari yang sama: Rp 44.000 (1 pesanan)')
    expect(email?.text).toContain('QRIS: Rp 96.800')
    expect(email?.text).toContain('1. Croissant: 4 terjual, Rp 88.000')
    expect(email?.text).toContain('Pembatalan: 1 pesanan (Rp 24.200)')
    expect(email?.text).toContain(`Buka dashboard: ${DASH}/`)
    expect(email?.text).not.toContain('110.000')
    const [otherEmail] = await emailsOf(other)
    expect(otherEmail?.subject).toBe('[ZuruPOS] Ringkasan Rabu, 25 Nov: Rp 110.000')
  })

  it('never sends a period twice', async () => {
    const r = await pass(wib('2026-11-26T08:05'), main)
    expect(r).toMatchObject({ sent: 0, already_sent: 1 })
    expect(await emailsOf(main)).toHaveLength(1)
  })

  it('sends once even when two passes run at the same time', async () => {
    const now = wib('2026-11-26T08:00')
    const results = await Promise.all([pass(now, parallel), pass(now, parallel)])
    expect(results.map((r) => r.sent).sort()).toEqual([0, 1])
    expect(results.map((r) => r.already_sent).sort()).toEqual([0, 1])
    expect(await emailsOf(parallel)).toHaveLength(1)
  })

  it('is sent on a day without orders, and says so', async () => {
    const r = await pass(wib('2026-11-26T08:00'), quiet)
    expect(r).toMatchObject({ sent: 1 })
    const [email] = await emailsOf(quiet)
    expect(email?.subject).toBe('[ZuruPOS] Ringkasan Rabu, 25 Nov: tidak ada transaksi')
    expect(email?.text).toContain('Tidak ada transaksi tercatat.')
  })

  it('respects the switches', async () => {
    await inTx(pool, quiet.tenantId, (c) => c.query('update tenants set daily_summary_enabled = false'))
    expect(await pass(wib('2026-11-27T08:00'), quiet)).toMatchObject({ sent: 0, already_sent: 0 })
    await inTx(pool, quiet.tenantId, (c) => c.query('update tenants set weekly_summary_enabled = false'))
    // Both off: the shop isn't in the schedule at all.
    expect(await scheduleFor(quiet)).toEqual([])
    await inTx(pool, quiet.tenantId, (c) =>
      c.query('update tenants set daily_summary_enabled = true, weekly_summary_enabled = true'),
    )
  })
})

describe('weekly summary (Monday 07:30 for the week before)', () => {
  it('queues the week against the one before', async () => {
    const r = await pass(wib('2026-11-30T08:00'), main)
    // The daily for Sunday 29 Nov (no orders) goes too.
    expect(r).toMatchObject({ sent: 2, failed: 0 })
    const weekly = (await emailsOf(main)).find((e) => e.kind === 'weekly_summary')
    expect(weekly?.to_addresses).toEqual([main.owner.email.toLowerCase()])
    expect(weekly?.subject).toBe('[ZuruPOS] Ringkasan minggu 23–29 Nov: Rp 88.000')
    expect(weekly?.text).toContain('Penjualan bersih: Rp 88.000 dari 3 pesanan')
    expect(weekly?.text).toContain('+100% dibanding minggu sebelumnya')
    expect(weekly?.text).toContain('Minggu sebelumnya: Rp 44.000 dari 1 pesanan')
    // Two trading days in 4 weeks: busy hours are not reliable yet, so left out.
    expect(weekly?.text).not.toContain('Jam ramai')
  })

  it('is skipped for a week without orders, once', async () => {
    const r = await pass(wib('2026-11-30T08:00'), quiet)
    expect(r).toMatchObject({ skipped_empty: 1 })
    expect((await emailsOf(quiet)).filter((e) => e.kind === 'weekly_summary')).toEqual([])
    expect(await pass(wib('2026-11-30T09:00'), quiet)).toMatchObject({ skipped_empty: 0, already_sent: 2 })
  })

  it('ran without errors', () => {
    expect(errors).toEqual([])
  })
})
