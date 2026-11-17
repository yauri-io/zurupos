import { sql } from 'kysely'
import type { Tx } from '../../db/with-tenant.js'

export const findOrderIdByClientId = (trx: Tx, tenantId: string, clientOrderId: string) =>
  trx
    .selectFrom('orders')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('client_order_id', '=', clientOrderId)
    .executeTakeFirst()

export const pricingSettings = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('tenants')
    .select([
      'timezone',
      'business_day_cutoff_hour',
      'service_charge_enabled',
      'service_charge_bps',
      'tax_enabled',
      'tax_name',
      'tax_bps',
      'tax_on_service_charge',
      'enabled_payment_methods',
    ])
    .where('id', '=', tenantId)
    .executeTakeFirstOrThrow()

// SPEC §12.1: business_date = date((now at tenant tz) − cutoff hours). Server time.
export const businessClock = async (trx: Tx, timezone: string, cutoffHour: number) => {
  const { rows } = await sql<{ now: Date; business_date: string }>`
    select now() as now,
           ((now() at time zone ${timezone}) - make_interval(hours => ${cutoffHour}))::date as business_date
  `.execute(trx)
  const row = rows[0]
  if (!row) throw new Error('businessClock: no row')
  return row
}

export const itemsForOrder = (trx: Tx, tenantId: string, ids: readonly string[]) =>
  trx
    .selectFrom('items as i')
    .innerJoin('categories as c', (j) =>
      j.onRef('c.tenant_id', '=', 'i.tenant_id').onRef('c.id', '=', 'i.category_id'),
    )
    .select([
      'i.id',
      'i.name',
      'i.price',
      'i.is_active',
      'i.is_available',
      'i.archived_at',
      'c.name as category_name',
    ])
    .where('i.tenant_id', '=', tenantId)
    .where('i.id', 'in', ids)
    .execute()

// Live modifier groups attached to the given items, with their rules.
export const groupsForItems = (trx: Tx, tenantId: string, itemIds: readonly string[]) =>
  trx
    .selectFrom('item_modifier_groups as l')
    .innerJoin('modifier_groups as g', (j) =>
      j.onRef('g.tenant_id', '=', 'l.tenant_id').onRef('g.id', '=', 'l.group_id'),
    )
    .select(['l.item_id', 'l.sort as link_sort', 'g.id', 'g.name', 'g.min_select', 'g.max_select', 'g.sort'])
    .where('l.tenant_id', '=', tenantId)
    .where('l.item_id', 'in', itemIds)
    .where('g.archived_at', 'is', null)
    .execute()

export const optionsByIds = (trx: Tx, tenantId: string, ids: readonly string[]) =>
  ids.length === 0
    ? Promise.resolve([])
    : trx
        .selectFrom('modifier_options as o')
        .innerJoin('modifier_groups as g', (j) =>
          j.onRef('g.tenant_id', '=', 'o.tenant_id').onRef('g.id', '=', 'o.group_id'),
        )
        .select([
          'o.id',
          'o.group_id',
          'o.name',
          'o.price_delta',
          'o.sort',
          'o.is_active',
          'o.archived_at',
          'g.name as group_name',
          'g.archived_at as group_archived_at',
        ])
        .where('o.tenant_id', '=', tenantId)
        .where('o.id', 'in', ids)
        .execute()

export const discountsByIds = (trx: Tx, tenantId: string, ids: readonly string[]) =>
  ids.length === 0
    ? Promise.resolve([])
    : trx
        .selectFrom('discounts')
        .select(['id', 'name', 'kind', 'value', 'scope', 'is_active', 'archived_at'])
        .where('tenant_id', '=', tenantId)
        .where('id', 'in', ids)
        .execute()

// SPEC §7.2 step 5: per-day sequence, allocated under the counter row's lock.
export const nextOrderNumber = async (trx: Tx, tenantId: string, businessDate: string) => {
  const row = await trx
    .insertInto('order_counters')
    .values({ tenant_id: tenantId, business_date: businessDate, last_number: 1 })
    .onConflict((oc) =>
      oc
        .columns(['tenant_id', 'business_date'])
        .doUpdateSet({ last_number: sql`order_counters.last_number + 1` }),
    )
    .returning('last_number')
    .executeTakeFirstOrThrow()
  return row.last_number
}

export type NewOrder = {
  tenant_id: string
  client_order_id: string
  order_number: number
  business_date: string
  status: 'paid'
  order_type: string
  customer_name: string | null
  note: string | null
  subtotal: bigint
  item_discount_total: bigint
  order_discount_id: string | null
  order_discount_name: string | null
  order_discount_kind: string | null
  order_discount_value: bigint | null
  order_discount_amount: bigint
  net_sales: bigint
  service_charge_bps: number
  service_charge_amount: bigint
  tax_name: string | null
  tax_bps: number
  tax_on_service_charge: boolean
  tax_amount: bigint
  total: bigint
  paid_total: bigint
  change_due: bigint
  created_by_user_id: string
  device_id: string | null
  client_created_at: string | null
  paid_at: Date
}

// Returns undefined when a concurrent request already stored this client_order_id.
export const insertOrder = (trx: Tx, row: NewOrder) =>
  trx
    .insertInto('orders')
    .values(row)
    .onConflict((oc) => oc.columns(['tenant_id', 'client_order_id']).doNothing())
    .returning('id')
    .executeTakeFirst()

export type NewLine = {
  tenant_id: string
  order_id: string
  line_no: number
  item_id: string
  item_name: string
  category_name: string
  unit_price: bigint
  modifiers_unit_total: bigint
  qty: number
  line_gross: bigint
  discount_id: string | null
  discount_name: string | null
  discount_kind: string | null
  discount_value: bigint | null
  discount_amount: bigint
  line_net: bigint
  note: string | null
}

export const insertLine = (trx: Tx, row: NewLine) =>
  trx.insertInto('order_lines').values(row).returning('id').executeTakeFirstOrThrow()

export const insertLineModifiers = (
  trx: Tx,
  rows: {
    tenant_id: string
    order_line_id: string
    seq: number
    option_id: string
    group_name: string
    option_name: string
    price_delta: bigint
  }[],
) => (rows.length === 0 ? Promise.resolve() : trx.insertInto('order_line_modifiers').values(rows).execute())

export const insertPayments = (
  trx: Tx,
  rows: {
    tenant_id: string
    order_id: string
    seq: number
    method: string
    amount: bigint
    tendered: bigint | null
    provider: string | null
    reference: string | null
  }[],
) => (rows.length === 0 ? Promise.resolve() : trx.insertInto('payments').values(rows).execute())

export const setLineCogs = (trx: Tx, tenantId: string, lineId: string, cogs: string) =>
  trx
    .updateTable('order_lines')
    .set({ cogs })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', lineId)
    .execute()

export const setOrderCogs = (trx: Tx, tenantId: string, orderId: string, cogsTotal: bigint) =>
  trx
    .updateTable('orders')
    .set({ cogs_total: cogsTotal })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', orderId)
    .execute()

const ORDER_COLUMNS = [
  'o.id',
  'o.client_order_id',
  'o.order_number',
  'o.business_date',
  'o.status',
  'o.source',
  'o.order_type',
  'o.customer_name',
  'o.note',
  'o.subtotal',
  'o.item_discount_total',
  'o.order_discount_id',
  'o.order_discount_name',
  'o.order_discount_kind',
  'o.order_discount_value',
  'o.order_discount_amount',
  'o.net_sales',
  'o.service_charge_bps',
  'o.service_charge_amount',
  'o.tax_name',
  'o.tax_bps',
  'o.tax_on_service_charge',
  'o.tax_amount',
  'o.total',
  'o.paid_total',
  'o.change_due',
  'o.cogs_total',
  'o.device_id',
  'o.client_created_at',
  'o.paid_at',
  'o.voided_at',
  'o.void_reason',
  'o.void_restock',
  'o.created_by_user_id',
  'o.voided_by_user_id',
  'o.void_approved_by_user_id',
] as const

export const findOrder = (trx: Tx, tenantId: string, id: string, opts: { forUpdate?: boolean } = {}) => {
  const query = trx
    .selectFrom('orders as o')
    .select(ORDER_COLUMNS)
    .where('o.tenant_id', '=', tenantId)
    .where('o.id', '=', id)
  return (opts.forUpdate ? query.forUpdate() : query).executeTakeFirst()
}

export type OrderRow = NonNullable<Awaited<ReturnType<typeof findOrder>>>

export const userNames = async (trx: Tx, tenantId: string, ids: readonly (string | null)[]) => {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return new Map<string, string>()
  const rows = await trx
    .selectFrom('users')
    .select(['id', 'name'])
    .where('tenant_id', '=', tenantId)
    .where('id', 'in', wanted)
    .execute()
  return new Map(rows.map((r) => [r.id, r.name]))
}

export const linesOf = (trx: Tx, tenantId: string, orderIds: readonly string[]) =>
  orderIds.length === 0
    ? Promise.resolve([])
    : trx
        .selectFrom('order_lines')
        .select([
          'id',
          'order_id',
          'line_no',
          'item_id',
          'item_name',
          'category_name',
          'unit_price',
          'modifiers_unit_total',
          'qty',
          'line_gross',
          'discount_id',
          'discount_name',
          'discount_kind',
          'discount_value',
          'discount_amount',
          'line_net',
          'note',
          'cogs',
        ])
        .where('tenant_id', '=', tenantId)
        .where('order_id', 'in', orderIds)
        .orderBy('line_no')
        .execute()

export const modifiersOf = (trx: Tx, tenantId: string, lineIds: readonly string[]) =>
  lineIds.length === 0
    ? Promise.resolve([])
    : trx
        .selectFrom('order_line_modifiers')
        .select(['order_line_id', 'option_id', 'group_name', 'option_name', 'price_delta'])
        .where('tenant_id', '=', tenantId)
        .where('order_line_id', 'in', lineIds)
        .orderBy('seq')
        .execute()

export const paymentsOf = (trx: Tx, tenantId: string, orderIds: readonly string[]) =>
  orderIds.length === 0
    ? Promise.resolve([])
    : trx
        .selectFrom('payments')
        .select(['order_id', 'seq', 'method', 'amount', 'tendered', 'provider', 'reference'])
        .where('tenant_id', '=', tenantId)
        .where('order_id', 'in', orderIds)
        .orderBy('seq')
        .execute()

export const ordersOfDay = (trx: Tx, tenantId: string, businessDate: string) =>
  trx
    .selectFrom('orders as o')
    .select(ORDER_COLUMNS)
    .where('o.tenant_id', '=', tenantId)
    .where('o.business_date', '=', businessDate)
    .orderBy('o.order_number', 'desc')
    .execute()

export const markVoided = (
  trx: Tx,
  tenantId: string,
  id: string,
  v: { voidedBy: string; approvedBy: string | null; reason: string; restock: boolean },
) =>
  trx
    .updateTable('orders')
    .set({
      status: 'voided',
      voided_at: sql<Date>`now()`,
      voided_by_user_id: v.voidedBy,
      void_approved_by_user_id: v.approvedBy,
      void_reason: v.reason,
      void_restock: v.restock,
    })
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .execute()

export const saleMovementsOf = (trx: Tx, tenantId: string, orderId: string) =>
  trx
    .selectFrom('stock_movements')
    .select(['ingredient_id', 'qty_delta', 'unit_cost'])
    .where('tenant_id', '=', tenantId)
    .where('order_id', '=', orderId)
    .where('type', '=', 'sale')
    .execute()
