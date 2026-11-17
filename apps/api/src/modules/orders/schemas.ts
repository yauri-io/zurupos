import { Type } from 'typebox'
import { Body, Cost, DateTime, Money, Name, Nullable, Pin, Uuid } from '../../http/schemas.js'
import { PaymentMethod } from '../settings/schemas.js'

const Bps = Type.Integer({ minimum: 1, maximum: 10_000 })
const DiscountKind = Type.Enum(['percent', 'fixed'])

// A preset (by id) or, for owner/manager sessions only, a custom discount (SPEC §6.5).
const DiscountChoice = Type.Union([
  Body({ discount_id: Uuid }),
  Body({ kind: Type.Literal('percent'), value: Bps }),
  Body({ kind: Type.Literal('fixed'), value: Type.Integer({ minimum: 1, maximum: 999_999_999_999 }) }),
])

export const CreateOrderBody = Body({
  client_order_id: Uuid,
  client_created_at: Type.Optional(DateTime),
  order_type: Type.Enum(['dine_in', 'takeaway']),
  customer_name: Type.Optional(Nullable(Type.String({ maxLength: 60 }))),
  note: Type.Optional(Nullable(Type.String({ maxLength: 500 }))),
  lines: Type.Array(
    Body({
      item_id: Uuid,
      qty: Type.Integer({ minimum: 1, maximum: 999 }),
      option_ids: Type.Optional(Type.Array(Uuid, { maxItems: 30, uniqueItems: true })),
      note: Type.Optional(Nullable(Type.String({ maxLength: 200 }))),
      discount: Type.Optional(Nullable(DiscountChoice)),
    }),
    { minItems: 1, maxItems: 100 },
  ),
  order_discount: Type.Optional(Nullable(DiscountChoice)),
  payments: Type.Array(
    Body({
      method: PaymentMethod,
      amount: Type.Integer({ minimum: 1, maximum: 999_999_999_999 }),
      tendered: Type.Optional(Nullable(Money)),
      provider: Type.Optional(Nullable(Type.String({ maxLength: 40 }))),
      reference: Type.Optional(Nullable(Type.String({ maxLength: 60 }))),
    }),
    { maxItems: 10 },
  ),
  // What the device showed; a mismatch means the menu changed (PRICE_CHANGED).
  expected_total: Type.Optional(Money),
})

const AppliedDiscount = Nullable(
  Type.Object({
    id: Nullable(Uuid),
    // null for a custom (non-preset) discount.
    name: Nullable(Type.String()),
    kind: DiscountKind,
    value: Type.Integer(),
    amount: Type.Integer(),
  }),
)
const UserRef = Type.Object({ id: Uuid, name: Type.String() })

export const OrderResponse = Type.Object({
  id: Uuid,
  client_order_id: Uuid,
  order_number: Type.Integer(),
  business_date: Type.String({ format: 'date' }),
  status: Type.Enum(['paid', 'voided']),
  source: Type.String(),
  order_type: Type.Enum(['dine_in', 'takeaway']),
  customer_name: Nullable(Type.String()),
  note: Nullable(Type.String()),
  subtotal: Type.Integer(),
  item_discount_total: Type.Integer(),
  order_discount: AppliedDiscount,
  net_sales: Type.Integer(),
  service_charge_bps: Type.Integer(),
  service_charge_amount: Type.Integer(),
  tax_name: Nullable(Type.String()),
  tax_bps: Type.Integer(),
  tax_on_service_charge: Type.Boolean(),
  tax_amount: Type.Integer(),
  total: Type.Integer(),
  paid_total: Type.Integer(),
  change_due: Type.Integer(),
  created_by: UserRef,
  device_id: Nullable(Uuid),
  client_created_at: Nullable(DateTime),
  paid_at: DateTime,
  void: Nullable(
    Type.Object({
      voided_at: DateTime,
      voided_by: UserRef,
      approved_by: Nullable(UserRef),
      reason: Type.String(),
      restock: Type.Boolean(),
    }),
  ),
  lines: Type.Array(
    Type.Object({
      id: Uuid,
      line_no: Type.Integer(),
      item_id: Uuid,
      item_name: Type.String(),
      category_name: Type.String(),
      unit_price: Type.Integer(),
      modifiers_unit_total: Type.Integer(),
      qty: Type.Integer(),
      line_gross: Type.Integer(),
      discount: AppliedDiscount,
      line_net: Type.Integer(),
      note: Nullable(Type.String()),
      modifiers: Type.Array(
        Type.Object({
          option_id: Uuid,
          group_name: Type.String(),
          option_name: Type.String(),
          price_delta: Type.Integer(),
        }),
      ),
      // Owner only (costs.view).
      cogs: Type.Optional(Cost),
    }),
  ),
  payments: Type.Array(
    Type.Object({
      seq: Type.Integer(),
      method: PaymentMethod,
      amount: Type.Integer(),
      tendered: Nullable(Type.Integer()),
      provider: Nullable(Type.String()),
      reference: Nullable(Type.String()),
    }),
  ),
  // Owner only (costs.view).
  cogs_total: Type.Optional(Type.Integer()),
})

// Today's list on the device. Employees see the total but no other money (PRD §6).
export const OrderSummary = Type.Object({
  id: Uuid,
  order_number: Type.Integer(),
  status: Type.Enum(['paid', 'voided']),
  order_type: Type.Enum(['dine_in', 'takeaway']),
  customer_name: Nullable(Type.String()),
  total: Type.Integer(),
  paid_at: DateTime,
  created_by: UserRef,
  // Enough for a barista ticket reprint (SPEC §11.1 #10); no prices.
  items: Type.Array(
    Type.Object({
      name: Type.String(),
      qty: Type.Integer(),
      modifiers: Type.Array(Type.String()),
      note: Nullable(Type.String()),
    }),
  ),
  payment_methods: Type.Optional(Type.Array(PaymentMethod)),
})

export const TodayResponse = Type.Object({
  business_date: Type.String({ format: 'date' }),
  orders: Type.Array(OrderSummary),
})

export const VoidBody = Body({
  reason: Name(500),
  restock: Type.Boolean(),
  // Cashiers need an owner/manager to approve with their PIN on this device (SPEC §5.4).
  approval: Type.Optional(Body({ user_id: Uuid, pin: Pin })),
})
