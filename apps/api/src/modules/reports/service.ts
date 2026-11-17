import type { AuthContext } from '../../auth/context.js'
import type { Tx } from '../../db/with-tenant.js'
import { divHalfUp } from '../../domain/decimal.js'
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
