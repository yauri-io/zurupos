// One report email for one shop and period (SPEC §12.6, D-074). Runs inside the
// shop's withTenant transaction: the run row, the figures and the outbox row
// commit together, so a period is emailed at most once.
import { divHalfUp, divRound } from '../domain/decimal.js'
import { buildHeatmap } from '../domain/heatmap.js'
import { buildMenuMatrix } from '../domain/menu-matrix.js'
import { addDays, type DueReport } from '../domain/report-schedule.js'
import type { Tx } from '../db/with-tenant.js'
import * as reports from '../modules/reports/queries.js'
import { enqueueEmail } from '../outbox/enqueue.js'
import { renderDailySummary, type PaymentMethod } from '../outbox/templates/daily-summary.js'
import { renderWeeklySummary, type MenuAction } from '../outbox/templates/weekly-summary.js'
import * as q from './queries.js'

export type SendOutcome = 'sent' | 'already_sent' | 'no_owner' | 'skipped_empty'

// Days behind the weekly email's busy hours and menu actions.
export const INSIGHT_DAYS = 28
const MAX_ACTIONS = 3

// Whole percent change, null without a base to compare with.
export const pctChange = (current: bigint, previous: bigint): bigint | null =>
  previous > 0n ? divRound((current - previous) * 100n, previous) : null

const dailyFigures = async (trx: Tx, tenantId: string, day: string) => {
  const r = { tenantId, from: day, to: day }
  const prevDay = addDays(day, -7)
  const [s, p, payments, items, voids, lowStock] = await Promise.all([
    reports.summary(trx, r),
    reports.summary(trx, { tenantId, from: prevDay, to: prevDay }),
    reports.payments(trx, r),
    reports.items(trx, r),
    reports.voids(trx, r),
    q.lowStockCount(trx, tenantId),
  ])
  const byMethod = new Map<PaymentMethod, bigint>()
  for (const row of payments) {
    const m = row.method as PaymentMethod
    byMethod.set(m, (byMethod.get(m) ?? 0n) + row.amount)
  }
  return {
    orders: s.orders,
    netSales: s.net_sales,
    averageOrderValue: s.orders > 0n ? divHalfUp(s.net_sales, s.orders) : 0n,
    prevNetSales: p.net_sales,
    prevOrders: p.orders,
    changePct: p.orders > 0n ? pctChange(s.net_sales, p.net_sales) : null,
    payments: [...byMethod]
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) =>
        a.amount === b.amount ? a.method.localeCompare(b.method) : a.amount > b.amount ? -1 : 1,
      ),
    topItems: items.slice(0, 3).map((i) => ({ name: i.name, qty: i.qty, net: i.net_after_order_discount })),
    voids: { count: voids.length, total: voids.reduce((sum, v) => sum + v.total, 0n) },
    lowStockCount: lowStock,
  }
}

const weeklyInsights = async (trx: Tx, tenantId: string, sunday: string) => {
  const r = { tenantId, from: addDays(sunday, -(INSIGHT_DAYS - 1)), to: sunday }
  const day = await reports.tenantDay(trx, tenantId)
  const [cells, trading, categories] = await Promise.all([
    reports.heatmapCells(trx, r, day.timezone),
    reports.tradingDays(trx, r),
    reports.matrixCategories(trx, r),
  ])
  const heat = buildHeatmap({
    cutoffHour: day.business_day_cutoff_hour,
    tradingDays: new Map(trading.map((t) => [t.weekday, t.days])),
    rows: cells.map((c) => ({ weekday: c.weekday, hour: c.hour, orders: c.orders, netSales: c.net_sales })),
  })
  const i = heat.insight.orders
  const busy = i ? { busiest: i.busiest, quietest: i.quietest, ratio: i.ratio } : null

  const raise: (MenuAction & { kind: 'naikkan_harga' })[] = []
  const promote: { action: MenuAction; qty: bigint }[] = []
  const incompleteCategories: string[] = []
  for (const c of categories) {
    const rows = await reports.matrixItems(trx, r, c.id)
    const m = buildMenuMatrix(
      rows.map((x) => ({
        itemId: x.item_id,
        name: x.name,
        archived: x.archived,
        qty: x.qty,
        net: x.net,
        cogs: x.cogs,
        zeroCogsLines: x.zero_cogs_lines,
        hasRecipe: x.has_recipe,
        uncostedIngredients: x.uncosted,
      })),
      INSIGHT_DAYS,
    )
    if (m.state === 'incomplete_costs') incompleteCategories.push(c.name)
    // Archived items are off the menu already; no advice about them.
    for (const it of m.items.filter((x) => !x.archived)) {
      if (it.quadrant === 'naikkan_harga' && it.suggestedIncrease !== null && it.extra30d !== null) {
        raise.push({
          kind: 'naikkan_harga',
          name: it.name,
          category: c.name,
          increase: it.suggestedIncrease,
          extra30d: it.extra30d,
        })
      } else if (it.quadrant === 'promosikan') {
        promote.push({ action: { kind: 'promosikan', name: it.name, category: c.name }, qty: it.qty })
      }
    }
  }
  raise.sort((a, b) =>
    a.extra30d === b.extra30d ? a.name.localeCompare(b.name) : a.extra30d > b.extra30d ? -1 : 1,
  )
  promote.sort((a, b) =>
    a.qty === b.qty ? a.action.name.localeCompare(b.action.name) : a.qty < b.qty ? -1 : 1,
  )
  const actions = [...raise, ...promote.map((p) => p.action)].slice(0, MAX_ACTIONS)
  return { busy, actions, incompleteCategories }
}

export const sendReport = async (
  trx: Tx,
  tenantId: string,
  due: DueReport,
  dashboardUrl: string,
): Promise<SendOutcome> => {
  if (!(await q.claimRun(trx, tenantId, due.kind, due.periodStart))) return 'already_sent'
  const shop = await q.shopAndOwner(trx, tenantId)
  // Owner only (D-074): these emails carry the shop's money figures.
  if (!shop.ownerEmail) return 'no_owner'

  if (due.kind === 'daily_summary') {
    const f = await dailyFigures(trx, tenantId, due.periodStart)
    await enqueueEmail(trx, {
      tenantId,
      kind: 'daily_summary',
      to: [shop.ownerEmail],
      email: renderDailySummary({
        locale: shop.locale,
        shopName: shop.name,
        day: due.periodStart,
        link: `${dashboardUrl}/`,
        ...f,
      }),
    })
    return 'sent'
  }

  const week = { tenantId, from: due.periodStart, to: due.periodEnd }
  const prev = { tenantId, from: addDays(due.periodStart, -7), to: addDays(due.periodEnd, -7) }
  const [s, p] = await Promise.all([reports.summary(trx, week), reports.summary(trx, prev)])
  // A week without sales has nothing to summarise (D-074); the run row stays so
  // later passes don't look again.
  if (s.orders === 0n) return 'skipped_empty'
  const insights = await weeklyInsights(trx, tenantId, due.periodEnd)
  const menuViews = await q.menuViewsInPeriod(trx, tenantId, due.periodStart, due.periodEnd)
  await enqueueEmail(trx, {
    tenantId,
    kind: 'weekly_summary',
    to: [shop.ownerEmail],
    email: renderWeeklySummary({
      locale: shop.locale,
      shopName: shop.name,
      from: due.periodStart,
      to: due.periodEnd,
      links: {
        home: `${dashboardUrl}/`,
        heatmap: `${dashboardUrl}/reports/heatmap`,
        menu: `${dashboardUrl}/reports/menu`,
      },
      orders: s.orders,
      netSales: s.net_sales,
      prevOrders: p.orders,
      prevNetSales: p.net_sales,
      changePct: pctChange(s.net_sales, p.net_sales),
      ...insights,
      menuViews,
    }),
  })
  return 'sent'
}
