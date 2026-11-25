import type { AuthContext } from '../../auth/context.js'
import type { Tx } from '../../db/with-tenant.js'
import { divHalfUp } from '../../domain/decimal.js'
import { buildHeatmap, type Insight } from '../../domain/heatmap.js'
import { buildMenuMatrix } from '../../domain/menu-matrix.js'
import { apiError } from '../../http/errors.js'
import { checkRange, type DateRange } from '../../http/date-range.js'
import { iso, money } from '../../http/serialize.js'
import * as q from './queries.js'

const range = (auth: AuthContext, query: DateRange): q.Range => ({
  tenantId: auth.tenantId,
  ...checkRange(query),
})

// Margin as basis points of net sales, half away from zero; null without sales.
export const marginBps = (margin: bigint, net: bigint): number | null => {
  if (net <= 0n) return null
  const bps = divHalfUp((margin < 0n ? -margin : margin) * 10_000n, net)
  return Number(margin < 0n ? -bps : bps)
}

const sales = (r: q.SalesRow) => ({
  gross_sales: money(r.gross_sales),
  discounts: money(r.discounts),
  net_sales: money(r.net_sales),
  service_charge: money(r.service_charge),
  tax: money(r.tax),
  total_collected: money(r.total_collected),
  orders: Number(r.orders),
})

export const summary = async (trx: Tx, auth: AuthContext, query: { from: string; to: string }) => {
  const r = range(auth, query)
  const row = await q.summary(trx, r)
  const margin = row.net_sales - row.cogs
  return {
    from: r.from,
    to: r.to,
    ...sales(row),
    average_order_value: row.orders === 0n ? 0 : money(divHalfUp(row.net_sales, row.orders)),
    cogs: money(row.cogs),
    gross_margin: money(margin),
    margin_bps: marginBps(margin, row.net_sales),
  }
}

export const daily = async (trx: Tx, auth: AuthContext, query: { from: string; to: string }) => ({
  days: (await q.daily(trx, range(auth, query))).map((d) => ({
    business_date: d.business_date,
    ...sales(d),
  })),
})

export const hourly = async (trx: Tx, auth: AuthContext, query: { from: string; to: string }) => {
  const r = range(auth, query)
  const rows = await q.hourly(trx, r, await q.tenantTimezone(trx, auth.tenantId))
  return {
    hours: rows.map((h) => ({ hour: h.hour, orders: Number(h.orders), net_sales: money(h.net_sales) })),
  }
}

// SPEC §12.4: at most 92 days, so one weekday never averages over more than ~13 weeks.
export const HEATMAP_MAX_DAYS = 92

const insight = (i: Insight | null) =>
  i && {
    busiest: { ...i.busiest, avg: Number(i.busiest.avg) },
    quietest: { ...i.quietest, avg: Number(i.quietest.avg) },
    ratio: i.ratio === null ? null : Number(i.ratio),
  }

export const heatmap = async (trx: Tx, auth: AuthContext, query: { from: string; to: string }) => {
  const r: q.Range = { tenantId: auth.tenantId, ...checkRange(query, HEATMAP_MAX_DAYS) }
  const day = await q.tenantDay(trx, auth.tenantId)
  const [cells, trading] = await Promise.all([q.heatmapCells(trx, r, day.timezone), q.tradingDays(trx, r)])
  const h = buildHeatmap({
    cutoffHour: day.business_day_cutoff_hour,
    tradingDays: new Map(trading.map((t) => [t.weekday, t.days])),
    rows: cells.map((c) => ({ weekday: c.weekday, hour: c.hour, orders: c.orders, netSales: c.net_sales })),
  })
  return {
    from: r.from,
    to: r.to,
    cutoff_hour: day.business_day_cutoff_hour,
    hours: h.hours,
    weekdays: h.weekdays.map((w) => ({
      weekday: w.weekday,
      trading_days: w.tradingDays,
      cells: w.cells.map(
        (c) =>
          c && {
            hour: c.hour,
            orders: Number(c.orders),
            net_sales: money(c.netSales),
            avg_orders_x10: Number(c.avgOrdersX10),
            avg_net_sales: money(c.avgNetSales),
          },
      ),
    })),
    weeks_of_data: h.weeksOfData,
    reliable: h.reliable,
    insight: { orders: insight(h.insight.orders), net_sales: insight(h.insight.netSales) },
  }
}

const DAY_MS = 86_400_000
const daysIn = (r: { from: string; to: string }) =>
  (Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / DAY_MS + 1
const nullableMoney = (v: bigint | null) => (v === null ? null : money(v))

export const menuMatrix = async (
  trx: Tx,
  auth: AuthContext,
  query: { from: string; to: string; category_id?: string },
) => {
  const r: q.Range = { tenantId: auth.tenantId, ...checkRange(query, HEATMAP_MAX_DAYS) }
  if (query.category_id && !(await q.categoryExists(trx, auth.tenantId, query.category_id))) {
    throw apiError('NOT_FOUND')
  }
  const categories = await q.matrixCategories(trx, r)
  const categoryId = query.category_id ?? categories[0]?.id ?? null
  const rows = categoryId ? await q.matrixItems(trx, r, categoryId) : []
  const m = buildMenuMatrix(
    rows.map((i) => ({
      itemId: i.item_id,
      name: i.name,
      archived: i.archived,
      qty: i.qty,
      net: i.net,
      cogs: i.cogs,
      zeroCogsLines: i.zero_cogs_lines,
      hasRecipe: i.has_recipe,
      uncostedIngredients: i.uncosted,
    })),
    daysIn(r),
  )
  return {
    from: r.from,
    to: r.to,
    category_id: categoryId,
    categories: categories.map((c) => ({ id: c.id, name: c.name, net: money(c.net) })),
    state: m.state,
    coverage_bps: m.coverageBps === null ? null : Number(m.coverageBps),
    avg_margin_per_portion: nullableMoney(m.avgMarginPerPortion),
    items: m.items.map((i) => ({
      item_id: i.itemId,
      name: i.name,
      archived: i.archived,
      qty: Number(i.qty),
      net: money(i.net),
      cogs: money(i.cogs),
      margin: money(i.margin),
      margin_per_portion: money(i.marginPerPortion),
      quadrant: i.quadrant,
      suggested_increase: nullableMoney(i.suggestedIncrease),
      extra_30d: nullableMoney(i.extra30d),
    })),
    incomplete: m.incomplete.map((i) => ({
      item_id: i.itemId,
      name: i.name,
      archived: i.archived,
      net: money(i.net),
      reasons: i.reasons,
      ingredients: i.ingredients,
    })),
  }
}

export const items = async (trx: Tx, auth: AuthContext, query: { from: string; to: string }) => ({
  items: (await q.items(trx, range(auth, query))).map((i) => ({
    item_id: i.item_id,
    name: i.name,
    category_name: i.category_name,
    qty: Number(i.qty),
    net_sales: money(i.net_sales),
    net_after_order_discount: money(i.net_after_order_discount),
  })),
})

export const categories = async (trx: Tx, auth: AuthContext, query: { from: string; to: string }) => ({
  categories: (await q.categories(trx, range(auth, query))).map((c) => ({
    name: c.name,
    qty: Number(c.qty),
    net_sales: money(c.net_sales),
    net_after_order_discount: money(c.net_after_order_discount),
  })),
})

export const payments = async (trx: Tx, auth: AuthContext, query: { from: string; to: string }) => {
  const rows = await q.payments(trx, range(auth, query))
  return {
    total: money(rows.reduce((s, p) => s + p.amount, 0n)),
    methods: rows.map((p) => ({
      method: p.method as 'cash',
      provider: p.provider,
      count: Number(p.count),
      amount: money(p.amount),
    })),
  }
}

export const margin = async (trx: Tx, auth: AuthContext, query: { from: string; to: string }) => {
  const r = range(auth, query)
  const row = await q.summary(trx, r)
  const itemRows = await q.items(trx, r)
  const total = row.net_sales - row.cogs
  return {
    net_sales: money(row.net_sales),
    cogs: money(row.cogs),
    gross_margin: money(total),
    margin_bps: marginBps(total, row.net_sales),
    items: itemRows.map((i) => {
      const m = i.net_after_order_discount - i.cogs
      return {
        item_id: i.item_id,
        name: i.name,
        net_after_order_discount: money(i.net_after_order_discount),
        cogs: money(i.cogs),
        gross_margin: money(m),
        margin_bps: marginBps(m, i.net_after_order_discount),
      }
    }),
  }
}

export const voids = async (trx: Tx, auth: AuthContext, query: { from: string; to: string }) => {
  const rows = await q.voids(trx, range(auth, query))
  return {
    count: rows.length,
    total: money(rows.reduce((s, o) => s + o.total, 0n)),
    orders: rows.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      business_date: o.business_date,
      total: money(o.total),
      reason: o.reason,
      restock: o.restock,
      voided_at: iso(o.voided_at),
      voided_by: { id: o.voided_by_id, name: o.voided_by_name },
      approved_by:
        o.approved_by_id && o.approved_by_name ? { id: o.approved_by_id, name: o.approved_by_name } : null,
    })),
  }
}

export const stockValue = async (trx: Tx, auth: AuthContext) => {
  const rows = await q.stockValue(trx, auth.tenantId)
  return {
    total: money(rows.reduce((s, i) => s + i.value, 0n)),
    ingredients: rows.map((i) => ({ ...i, value: money(i.value) })),
  }
}
