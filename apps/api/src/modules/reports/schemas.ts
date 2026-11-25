import { Type } from 'typebox'
import { Body, Cost, DateTime, Nullable, SignedQty, Uuid } from '../../http/schemas.js'
import { PaymentMethod } from '../settings/schemas.js'

const Day = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })

// Inclusive business-date range (SPEC §12.1).
export const RangeQuery = Body({ from: Day, to: Day })

const Int = Type.Integer()
// Margin as basis points of net sales; null when there were no net sales.
const MarginBps = Nullable(Type.Integer())

const SalesMetrics = {
  gross_sales: Int,
  discounts: Int,
  net_sales: Int,
  service_charge: Int,
  tax: Int,
  total_collected: Int,
  orders: Int,
}

export const SummaryResponse = Type.Object({
  from: Day,
  to: Day,
  ...SalesMetrics,
  average_order_value: Int,
  cogs: Int,
  gross_margin: Int,
  margin_bps: MarginBps,
})

export const DailyResponse = Type.Object({
  days: Type.Array(Type.Object({ business_date: Day, ...SalesMetrics })),
})

export const HourlyResponse = Type.Object({
  // 24 rows, local hour of paid_at in the shop's time zone.
  hours: Type.Array(Type.Object({ hour: Int, orders: Int, net_sales: Int })),
})

const ItemSales = {
  qty: Int,
  // Σ line_net.
  net_sales: Int,
  // With the order discount allocated to lines in proportion to line_net (SPEC §12.2).
  net_after_order_discount: Int,
}

export const ItemsResponse = Type.Object({
  items: Type.Array(
    Type.Object({ item_id: Uuid, name: Type.String(), category_name: Type.String(), ...ItemSales }),
  ),
})

export const CategoriesResponse = Type.Object({
  categories: Type.Array(Type.Object({ name: Type.String(), ...ItemSales })),
})

export const PaymentsResponse = Type.Object({
  total: Int,
  methods: Type.Array(
    Type.Object({ method: PaymentMethod, provider: Nullable(Type.String()), count: Int, amount: Int }),
  ),
})

export const MarginResponse = Type.Object({
  net_sales: Int,
  cogs: Int,
  gross_margin: Int,
  margin_bps: MarginBps,
  items: Type.Array(
    Type.Object({
      item_id: Uuid,
      name: Type.String(),
      net_after_order_discount: Int,
      cogs: Int,
      gross_margin: Int,
      margin_bps: MarginBps,
    }),
  ),
})

// SPEC §12.4. Averages are per trading day of that weekday, half-up.
const HeatmapCell = Type.Object({
  hour: Int,
  orders: Int,
  net_sales: Int,
  // Average orders in tenths: 25 = 2,5 orders.
  avg_orders_x10: Int,
  avg_net_sales: Int,
})
// `avg` is in the metric's unit: tenths of an order, or whole rupiah.
const Peak = Type.Object({ weekday: Int, hour: Int, avg: Int })
const Insight = Nullable(
  Type.Object({
    busiest: Peak,
    quietest: Peak,
    // Rounded busiest / quietest; null unless the busiest is at least twice the quietest.
    ratio: Nullable(Int),
  }),
)

export const HeatmapResponse = Type.Object({
  from: Day,
  to: Day,
  cutoff_hour: Int,
  // Hours in business-day order (the cutoff hour first), trimmed to those with orders.
  hours: Type.Array(Int),
  // ISO weekdays 1 (Monday) … 7; `cells` follows `hours`, null on a weekday without trading days.
  weekdays: Type.Array(
    Type.Object({ weekday: Int, trading_days: Int, cells: Type.Array(Nullable(HeatmapCell)) }),
  ),
  weeks_of_data: Int,
  reliable: Type.Boolean(),
  insight: Type.Object({ orders: Insight, net_sales: Insight }),
})

const UserRef = Type.Object({ id: Uuid, name: Type.String() })

export const VoidsResponse = Type.Object({
  count: Int,
  total: Int,
  orders: Type.Array(
    Type.Object({
      id: Uuid,
      order_number: Int,
      business_date: Day,
      total: Int,
      reason: Type.String(),
      restock: Type.Boolean(),
      voided_at: DateTime,
      voided_by: UserRef,
      approved_by: Nullable(UserRef),
    }),
  ),
})

export const StockValueResponse = Type.Object({
  total: Int,
  ingredients: Type.Array(
    Type.Object({
      id: Uuid,
      name: Type.String(),
      base_unit: Type.String(),
      stock_qty: SignedQty,
      avg_cost: Cost,
      // max(stock_qty, 0) × avg_cost, whole rupiah (half-up).
      value: Int,
    }),
  ),
})
