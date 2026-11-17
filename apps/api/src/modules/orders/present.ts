// Order reads and response mapping. Cost fields only for costs.view (SPEC §5.5);
// employees see totals but no other money (PRD §6).
import type { AuthContext } from '../../auth/context.js'
import { can } from '../../auth/permissions.js'
import type { Tx } from '../../db/with-tenant.js'
import { formatCost, parseCost } from '../../domain/decimal.js'
import { decodeCursor, encodeCursor, pageLimit } from '../../http/cursor.js'
import { checkRange } from '../../http/date-range.js'
import { apiError } from '../../http/errors.js'
import { iso, isoOrNull, money } from '../../http/serialize.js'
import * as q from './queries.js'

type Method = 'cash' | 'qris' | 'debit' | 'credit' | 'transfer' | 'other'
type Kind = 'percent' | 'fixed'

const applied = (d: {
  id: string | null
  name: string | null
  kind: string | null
  value: bigint | null
  amount: bigint
}) =>
  d.kind === null || d.value === null
    ? null
    : { id: d.id, name: d.name, kind: d.kind as Kind, value: money(d.value), amount: money(d.amount) }

export const loadOrders = async (trx: Tx, auth: AuthContext, orders: q.OrderRow[]) => {
  const ids = orders.map((o) => o.id)
  const [lines, payments, names] = await Promise.all([
    q.linesOf(trx, auth.tenantId, ids),
    q.paymentsOf(trx, auth.tenantId, ids),
    q.userNames(
      trx,
      auth.tenantId,
      orders.flatMap((o) => [o.created_by_user_id, o.voided_by_user_id, o.void_approved_by_user_id]),
    ),
  ])
  const modifiers = await q.modifiersOf(
    trx,
    auth.tenantId,
    lines.map((l) => l.id),
  )
  const withCosts = can(auth.role, 'costs.view')
  const ref = (id: string) => ({ id, name: names.get(id) ?? '' })

  return orders.map((o) => ({
    id: o.id,
    client_order_id: o.client_order_id,
    order_number: o.order_number,
    business_date: o.business_date,
    status: o.status as 'paid' | 'voided',
    source: o.source,
    order_type: o.order_type as 'dine_in' | 'takeaway',
    customer_name: o.customer_name,
    note: o.note,
    subtotal: money(o.subtotal),
    item_discount_total: money(o.item_discount_total),
    order_discount: applied({
      id: o.order_discount_id,
      name: o.order_discount_name,
      kind: o.order_discount_kind,
      value: o.order_discount_value,
      amount: o.order_discount_amount,
    }),
    net_sales: money(o.net_sales),
    service_charge_bps: o.service_charge_bps,
    service_charge_amount: money(o.service_charge_amount),
    tax_name: o.tax_name,
    tax_bps: o.tax_bps,
    tax_on_service_charge: o.tax_on_service_charge,
    tax_amount: money(o.tax_amount),
    total: money(o.total),
    paid_total: money(o.paid_total),
    change_due: money(o.change_due),
    created_by: ref(o.created_by_user_id),
    device_id: o.device_id,
    client_created_at: isoOrNull(o.client_created_at),
    paid_at: iso(o.paid_at),
    void:
      o.status === 'voided' && o.voided_at && o.voided_by_user_id && o.void_reason !== null
        ? {
            voided_at: iso(o.voided_at),
            voided_by: ref(o.voided_by_user_id),
            approved_by: o.void_approved_by_user_id ? ref(o.void_approved_by_user_id) : null,
            reason: o.void_reason,
            restock: o.void_restock === true,
          }
        : null,
    lines: lines
      .filter((l) => l.order_id === o.id)
      .map((l) => ({
        id: l.id,
        line_no: l.line_no,
        item_id: l.item_id,
        item_name: l.item_name,
        category_name: l.category_name,
        unit_price: money(l.unit_price),
        modifiers_unit_total: money(l.modifiers_unit_total),
        qty: l.qty,
        line_gross: money(l.line_gross),
        discount: applied({
          id: l.discount_id,
          name: l.discount_name,
          kind: l.discount_kind,
          value: l.discount_value,
          amount: l.discount_amount,
        }),
        line_net: money(l.line_net),
        note: l.note,
        modifiers: modifiers
          .filter((m) => m.order_line_id === l.id)
          .map((m) => ({
            option_id: m.option_id,
            group_name: m.group_name,
            option_name: m.option_name,
            price_delta: money(m.price_delta),
          })),
        ...(withCosts ? { cogs: formatCost(parseCost(l.cogs)) } : {}),
      })),
    payments: payments
      .filter((p) => p.order_id === o.id)
      .map((p) => ({
        seq: p.seq,
        method: p.method as Method,
        amount: money(p.amount),
        tendered: p.tendered === null ? null : money(p.tendered),
        provider: p.provider,
        reference: p.reference,
      })),
    ...(withCosts ? { cogs_total: money(o.cogs_total) } : {}),
  }))
}

export const loadOrder = async (trx: Tx, auth: AuthContext, id: string) => {
  const row = await q.findOrder(trx, auth.tenantId, id)
  if (!row) throw apiError('NOT_FOUND')
  const [order] = await loadOrders(trx, auth, [row])
  if (!order) throw apiError('NOT_FOUND')
  return order
}

export const currentBusinessDate = async (trx: Tx, tenantId: string) => {
  const s = await q.pricingSettings(trx, tenantId)
  return (await q.businessClock(trx, s.timezone, s.business_day_cutoff_hour)).business_date
}

// Owners read any order; other roles only today's (orders.view_today).
export const getOrder = async (trx: Tx, auth: AuthContext, id: string) => {
  const order = await loadOrder(trx, auth, id)
  if (
    !can(auth.role, 'orders.view_all') &&
    order.business_date !== (await currentBusinessDate(trx, auth.tenantId))
  ) {
    throw apiError('NOT_FOUND')
  }
  return order
}

type Loaded = Awaited<ReturnType<typeof loadOrders>>[number]

const summarize = (o: Loaded, seesPayments: boolean) => ({
  id: o.id,
  order_number: o.order_number,
  status: o.status,
  order_type: o.order_type,
  customer_name: o.customer_name,
  total: o.total,
  paid_at: o.paid_at,
  created_by: o.created_by,
  items: o.lines.map((l) => ({
    name: l.item_name,
    qty: l.qty,
    modifiers: l.modifiers.map((m) => m.option_name),
    note: l.note,
  })),
  ...(seesPayments ? { payment_methods: [...new Set(o.payments.map((p) => p.method))] } : {}),
})

// GET /orders (owner): filtered history, newest first.
export const listOrders = async (
  trx: Tx,
  auth: AuthContext,
  query: {
    from: string
    to: string
    status?: 'paid' | 'voided'
    method?: string
    user_id?: string
    q?: string
    cursor?: string
    limit?: string
  },
) => {
  const range = checkRange(query)
  const limit = pageLimit(query.limit)
  const rows = await q.listOrders(
    trx,
    auth.tenantId,
    {
      ...range,
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.user_id ? { userId: query.user_id } : {}),
      ...(query.q ? { q: query.q } : {}),
    },
    decodeCursor(query.cursor),
    limit,
  )
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  const orders = await loadOrders(trx, auth, page)
  return {
    orders: orders.map((o) => ({ ...summarize(o, true), business_date: o.business_date })),
    next_cursor:
      rows.length > limit && last ? encodeCursor({ createdAt: last.cursor_at, id: last.id }) : null,
  }
}

export const today = async (trx: Tx, auth: AuthContext) => {
  const businessDate = await currentBusinessDate(trx, auth.tenantId)
  const orders = await loadOrders(trx, auth, await q.ordersOfDay(trx, auth.tenantId, businessDate))
  // Employees don't handle money: the total only, no payment details.
  const seesPayments = can(auth.role, 'orders.reprint_receipt')
  return {
    business_date: businessDate,
    orders: orders.map((o) => summarize(o, seesPayments)),
  }
}
