// SPEC §12.2 report queries. Every query names tenant_id explicitly (RLS also
// applies) and filters `status = 'paid'` explicitly, never "not voided" (§14.2 #2).
import { sql } from 'kysely'
import type { Tx } from '../../db/with-tenant.js'

export type Range = { tenantId: string; from: string; to: string }

const paidInRange = (r: Range) =>
  sql`o.tenant_id = ${r.tenantId} and o.status = 'paid' and o.business_date between ${r.from}::date and ${r.to}::date`

const rows = async <T>(trx: Tx, query: ReturnType<typeof sql<T>>) => (await query.execute(trx)).rows

const salesColumns = sql`
  count(o.id)::bigint as orders,
  coalesce(sum(o.subtotal), 0)::bigint as gross_sales,
  coalesce(sum(o.item_discount_total + o.order_discount_amount), 0)::bigint as discounts,
  coalesce(sum(o.net_sales), 0)::bigint as net_sales,
  coalesce(sum(o.service_charge_amount), 0)::bigint as service_charge,
  coalesce(sum(o.tax_amount), 0)::bigint as tax,
  coalesce(sum(o.total), 0)::bigint as total_collected`

export type SalesRow = {
  orders: bigint
  gross_sales: bigint
  discounts: bigint
  net_sales: bigint
  service_charge: bigint
  tax: bigint
  total_collected: bigint
}

export const summary = async (trx: Tx, r: Range) => {
  const [row] = await rows(
    trx,
    sql<SalesRow & { cogs: bigint }>`
      select ${salesColumns}, coalesce(sum(o.cogs_total), 0)::bigint as cogs
      from orders o where ${paidInRange(r)}`,
  )
  if (!row) throw new Error('summary: no row')
  return row
}

// One row per business date in the range, including days without sales.
export const daily = (trx: Tx, r: Range) =>
  rows(
    trx,
    sql<SalesRow & { business_date: string }>`
      select d::date::text as business_date, ${salesColumns}
      from generate_series(${r.from}::date, ${r.to}::date, interval '1 day') d
      left join orders o
        on o.business_date = d::date and o.tenant_id = ${r.tenantId} and o.status = 'paid'
      group by d order by d`,
  )

export const hourly = (trx: Tx, r: Range, timezone: string) =>
  rows(
    trx,
    sql<{ hour: number; orders: bigint; net_sales: bigint }>`
      select h as hour, count(o.id)::bigint as orders, coalesce(sum(o.net_sales), 0)::bigint as net_sales
      from generate_series(0, 23) h
      left join orders o
        on extract(hour from o.paid_at at time zone ${timezone})::int = h and ${paidInRange(r)}
      group by h order by h`,
  )

// Lines of paid orders in range with the order discount allocated to lines in
// proportion to line_net: floor shares, remainder to the largest line (ties: lowest line_no).
const allocatedLines = (r: Range) => sql`
  with l as (
    select ol.order_id, ol.item_id, ol.item_name, ol.category_name, ol.qty, ol.line_net, ol.cogs, o.paid_at,
           o.order_discount_amount as od,
           (sum(ol.line_net) over (partition by ol.order_id))::bigint as order_net,
           row_number() over (partition by ol.order_id order by ol.line_net desc, ol.line_no) as rank
    from order_lines ol
    join orders o on o.tenant_id = ol.tenant_id and o.id = ol.order_id
    where ${paidInRange(r)}
  ), shares as (
    -- bigint / bigint: integer division, i.e. floor for these non-negative values.
    select l.*, case when order_net = 0 then 0::bigint else (od * line_net) / order_net end as share from l
  )
  select item_id, item_name, category_name, qty, line_net, cogs, paid_at,
         line_net - share - case when rank = 1 then od - (sum(share) over (partition by order_id))::bigint else 0 end
           as net_after
  from shares`

export type ItemRow = {
  item_id: string
  name: string
  category_name: string
  qty: bigint
  net_sales: bigint
  net_after_order_discount: bigint
  cogs: bigint
}

export const items = (trx: Tx, r: Range) =>
  rows(
    trx,
    sql<ItemRow>`
      with a as (${allocatedLines(r)})
      select item_id,
             (array_agg(item_name order by paid_at desc))[1] as name,
             (array_agg(category_name order by paid_at desc))[1] as category_name,
             sum(qty)::bigint as qty,
             sum(line_net)::bigint as net_sales,
             sum(net_after)::bigint as net_after_order_discount,
             round(sum(cogs))::bigint as cogs
      from a group by item_id
      order by net_after_order_discount desc, name`,
  )

export const categories = (trx: Tx, r: Range) =>
  rows(
    trx,
    sql<{ name: string; qty: bigint; net_sales: bigint; net_after_order_discount: bigint }>`
      with a as (${allocatedLines(r)})
      select category_name as name, sum(qty)::bigint as qty, sum(line_net)::bigint as net_sales,
             sum(net_after)::bigint as net_after_order_discount
      from a group by category_name
      order by net_after_order_discount desc, name`,
  )

export const payments = (trx: Tx, r: Range) =>
  rows(
    trx,
    sql<{ method: string; provider: string | null; count: bigint; amount: bigint }>`
      select p.method, p.provider, count(*)::bigint as count, sum(p.amount)::bigint as amount
      from payments p
      join orders o on o.tenant_id = p.tenant_id and o.id = p.order_id
      where ${paidInRange(r)}
      group by p.method, p.provider
      order by amount desc, p.method, p.provider nulls first`,
  )

export const voids = (trx: Tx, r: Range) =>
  rows(
    trx,
    sql<{
      id: string
      order_number: number
      business_date: string
      total: bigint
      reason: string
      restock: boolean
      voided_at: Date
      voided_by_id: string
      voided_by_name: string
      approved_by_id: string | null
      approved_by_name: string | null
    }>`
      select o.id, o.order_number, o.business_date::text, o.total, o.void_reason as reason,
             o.void_restock as restock, o.voided_at,
             v.id as voided_by_id, v.name as voided_by_name, a.id as approved_by_id, a.name as approved_by_name
      from orders o
      join users v on v.tenant_id = o.tenant_id and v.id = o.voided_by_user_id
      left join users a on a.tenant_id = o.tenant_id and a.id = o.void_approved_by_user_id
      where o.tenant_id = ${r.tenantId} and o.status = 'voided'
        and o.business_date between ${r.from}::date and ${r.to}::date
      order by o.voided_at desc, o.id`,
  )

export const stockValue = (trx: Tx, tenantId: string) =>
  rows(
    trx,
    sql<{ id: string; name: string; base_unit: string; stock_qty: string; avg_cost: string; value: bigint }>`
      select id, name, base_unit, stock_qty::text, avg_cost::text,
             round(greatest(stock_qty, 0) * avg_cost)::bigint as value
      from ingredients
      where tenant_id = ${tenantId} and archived_at is null
      order by value desc, name`,
  )

export const tenantTimezone = async (trx: Tx, tenantId: string) =>
  (await trx.selectFrom('tenants').select('timezone').where('id', '=', tenantId).executeTakeFirstOrThrow())
    .timezone
