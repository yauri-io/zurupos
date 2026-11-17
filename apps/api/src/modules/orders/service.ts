// POST /v1/orders — SPEC §7.2. One tenant transaction: validate (§6.5), price
// (§6), check payments (§6.4), number the order, store it, deduct stock (§7.1,
// locked in ingredient id order), compute COGS, run the low-stock check (§8).
import { writeAudit } from '../../audit/audit.js'
import type { AuthContext } from '../../auth/context.js'
import { can } from '../../auth/permissions.js'
import type { Config } from '../../config/env.js'
import type { Tx } from '../../db/with-tenant.js'
import { costOf, toRupiah } from '../../domain/avg-cost.js'
import { formatCost } from '../../domain/decimal.js'
import { checkPayments, priceOrder, type Discount } from '../../domain/pricing.js'
import { apiError } from '../../http/errors.js'
import { money } from '../../http/serialize.js'
import { applyMovement, lockIngredients, type LockedIngredient } from '../../stock/ledger.js'
import { checkLowStock } from '../../stock/low-stock.js'
import { resolveLine } from '../recipes/service.js'
import { loadOrder } from './present.js'
import * as q from './queries.js'

type DiscountChoice = { discount_id: string } | { kind: 'percent' | 'fixed'; value: number }

export type CreateOrderInput = {
  client_order_id: string
  client_created_at?: string
  order_type: 'dine_in' | 'takeaway'
  customer_name?: string | null
  note?: string | null
  lines: {
    item_id: string
    qty: number
    option_ids?: string[]
    note?: string | null
    discount?: DiscountChoice | null
  }[]
  order_discount?: DiscountChoice | null
  payments: {
    method: string
    amount: number
    tendered?: number | null
    provider?: string | null
    reference?: string | null
  }[]
  expected_total?: number
}

// Thrown when a concurrent request stored the same client_order_id first. The
// route re-reads that order in a fresh transaction and returns it (idempotency).
export class DuplicateOrder extends Error {
  constructor(readonly clientOrderId: string) {
    super('duplicate client_order_id')
  }
}

type Snapshot = { id: string | null; name: string | null; discount: Discount }

const textOrNull = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const resolveDiscounts = async (trx: Tx, auth: AuthContext, input: CreateOrderInput) => {
  const choices = [...input.lines.map((l) => l.discount ?? null), input.order_discount ?? null]
  const presetIds = choices.flatMap((c) => (c && 'discount_id' in c ? [c.discount_id] : []))
  const presets = new Map((await q.discountsByIds(trx, auth.tenantId, presetIds)).map((d) => [d.id, d]))
  let custom = false

  const pick = (choice: DiscountChoice | null, scope: 'item' | 'order'): Snapshot | null => {
    if (choice === null) return null
    if ('discount_id' in choice) {
      const d = presets.get(choice.discount_id)
      if (!d) throw apiError('NOT_FOUND')
      if (d.archived_at !== null || !d.is_active) {
        throw apiError('VALIDATION', { field: 'discount', problem: 'discount_inactive', discount_id: d.id })
      }
      if (d.scope !== scope) {
        throw apiError('VALIDATION', { field: 'discount', problem: 'discount_scope', discount_id: d.id })
      }
      return { id: d.id, name: d.name, discount: { kind: d.kind as Discount['kind'], value: d.value } }
    }
    // Custom discounts: owner/manager sessions only (PRD F7).
    if (!can(auth.role, 'discounts.apply_custom')) throw apiError('FORBIDDEN', { reason: 'custom_discount' })
    custom = true
    return { id: null, name: null, discount: { kind: choice.kind, value: BigInt(choice.value) } }
  }

  return {
    lines: input.lines.map((l) => pick(l.discount ?? null, 'item')),
    order: pick(input.order_discount ?? null, 'order'),
    custom: () => custom,
  }
}

// SPEC §6.5: items and options must be live, active, of this tenant, and each
// attached group's selection count within [min, max].
const validateSelections = async (trx: Tx, auth: AuthContext, input: CreateOrderInput) => {
  const itemIds = [...new Set(input.lines.map((l) => l.item_id))]
  const items = new Map((await q.itemsForOrder(trx, auth.tenantId, itemIds)).map((i) => [i.id, i]))
  const optionIds = [...new Set(input.lines.flatMap((l) => l.option_ids ?? []))]
  const options = new Map((await q.optionsByIds(trx, auth.tenantId, optionIds)).map((o) => [o.id, o]))
  const groups = await q.groupsForItems(trx, auth.tenantId, itemIds)

  for (const id of itemIds) if (!items.has(id)) throw apiError('NOT_FOUND')
  for (const id of optionIds) if (!options.has(id)) throw apiError('NOT_FOUND')

  return input.lines.map((line, index) => {
    const item = items.get(line.item_id)
    if (!item) throw apiError('NOT_FOUND')
    if (item.archived_at !== null || !item.is_active || !item.is_available) {
      throw apiError('ITEM_UNAVAILABLE', { item_id: item.id, line: index })
    }
    const attached = groups.filter((g) => g.item_id === item.id)
    const chosen = (line.option_ids ?? []).map((id) => {
      const option = options.get(id)
      if (!option) throw apiError('NOT_FOUND')
      if (option.archived_at !== null || option.group_archived_at !== null || !option.is_active) {
        throw apiError('ITEM_UNAVAILABLE', { option_id: option.id, line: index })
      }
      if (!attached.some((g) => g.id === option.group_id)) {
        throw apiError('VALIDATION', { field: 'option_ids', problem: 'option_not_on_item', line: index })
      }
      return option
    })
    // Modifier-sheet order (D-033): the item's group order, then the option's sort.
    const groupRank = (groupId: string) => {
      const g = attached.find((x) => x.id === groupId)
      return g ? [g.link_sort, g.sort] : [0, 0]
    }
    chosen.sort((a, b) => {
      const [al = 0, ag = 0] = groupRank(a.group_id)
      const [bl = 0, bg = 0] = groupRank(b.group_id)
      return (
        al - bl ||
        ag - bg ||
        a.group_id.localeCompare(b.group_id) ||
        a.sort - b.sort ||
        a.name.localeCompare(b.name)
      )
    })
    for (const g of attached) {
      const n = chosen.filter((o) => o.group_id === g.id).length
      if (n < g.min_select || n > g.max_select) {
        throw apiError('VALIDATION', {
          field: 'option_ids',
          problem: 'modifier_count',
          group_id: g.id,
          line: index,
        })
      }
    }
    return { item, options: chosen }
  })
}

const paymentProblem = (code: string) =>
  code === 'METHOD_DISABLED' ? 'payment_method_disabled' : 'payment_invalid'

export const createOrder = async (trx: Tx, config: Config, auth: AuthContext, input: CreateOrderInput) => {
  // 1. Idempotency: the same client_order_id returns the stored order.
  const existing = await q.findOrderIdByClientId(trx, auth.tenantId, input.client_order_id)
  if (existing) return { created: false, order: await loadOrder(trx, auth, existing.id) }

  // 2. Load and validate everything referenced.
  const settings = await q.pricingSettings(trx, auth.tenantId)
  const selections = await validateSelections(trx, auth, input)
  const discounts = await resolveDiscounts(trx, auth, input)

  // 3. Price on the server; the client's number is only a cross-check.
  const priced = priceOrder(
    input.lines.map((line, i) => ({
      unitPrice: selections[i]?.item.price ?? 0n,
      optionDeltas: selections[i]?.options.map((o) => o.price_delta) ?? [],
      qty: line.qty,
      discount: discounts.lines[i]?.discount ?? null,
    })),
    discounts.order?.discount ?? null,
    {
      serviceChargeEnabled: settings.service_charge_enabled,
      serviceChargeBps: settings.service_charge_bps,
      taxEnabled: settings.tax_enabled,
      taxBps: settings.tax_bps,
      taxOnServiceCharge: settings.tax_on_service_charge,
    },
  )
  if (input.expected_total !== undefined && BigInt(input.expected_total) !== priced.total) {
    throw apiError('PRICE_CHANGED', {
      expected_total: input.expected_total,
      total: money(priced.total),
      subtotal: money(priced.subtotal),
      item_discount_total: money(priced.itemDiscountTotal),
      order_discount_amount: money(priced.orderDiscountAmount),
      service_charge_amount: money(priced.serviceChargeAmount),
      tax_amount: money(priced.taxAmount),
      line_totals: priced.lines.map((l) => money(l.lineNet)),
    })
  }

  // 4. Payments (§6.4).
  for (const [index, p] of input.payments.entries()) {
    if (p.method === 'cash' && (textOrNull(p.provider) || textOrNull(p.reference))) {
      throw apiError('VALIDATION', { field: 'payments', problem: 'cash_has_no_reference', index })
    }
  }
  const payments = input.payments.map((p) => ({
    method: p.method,
    amount: BigInt(p.amount),
    tendered: p.tendered === undefined || p.tendered === null ? null : BigInt(p.tendered),
  }))
  const paid = checkPayments(priced.total, payments, settings.enabled_payment_methods)
  if (!paid.ok) {
    if (paid.code === 'PAYMENT_MISMATCH') {
      throw apiError('PAYMENT_MISMATCH', {
        total: money(priced.total),
        paid: money(payments.reduce((s, p) => s + p.amount, 0n)),
      })
    }
    throw apiError('VALIDATION', { field: 'payments', problem: paymentProblem(paid.code), index: paid.index })
  }

  // 5. Business date and the day's order number.
  const clock = await q.businessClock(trx, settings.timezone, settings.business_day_cutoff_hour)
  const orderNumber = await q.nextOrderNumber(trx, auth.tenantId, clock.business_date)

  // 6. Store the order, lines, modifiers and payments (with snapshots).
  const inserted = await q.insertOrder(trx, {
    tenant_id: auth.tenantId,
    client_order_id: input.client_order_id,
    order_number: orderNumber,
    business_date: clock.business_date,
    status: 'paid',
    order_type: input.order_type,
    customer_name: textOrNull(input.customer_name),
    note: textOrNull(input.note),
    subtotal: priced.subtotal,
    item_discount_total: priced.itemDiscountTotal,
    order_discount_id: discounts.order?.id ?? null,
    order_discount_name: discounts.order?.name ?? null,
    order_discount_kind: discounts.order?.discount.kind ?? null,
    order_discount_value: discounts.order?.discount.value ?? null,
    order_discount_amount: priced.orderDiscountAmount,
    net_sales: priced.netSales,
    service_charge_bps: settings.service_charge_enabled ? settings.service_charge_bps : 0,
    service_charge_amount: priced.serviceChargeAmount,
    tax_name: settings.tax_enabled ? settings.tax_name : null,
    tax_bps: settings.tax_enabled ? settings.tax_bps : 0,
    tax_on_service_charge: settings.tax_on_service_charge,
    tax_amount: priced.taxAmount,
    total: priced.total,
    paid_total: priced.total,
    change_due: paid.changeDue,
    created_by_user_id: auth.userId,
    device_id: auth.deviceId,
    client_created_at: input.client_created_at ?? null,
    paid_at: clock.now,
  })
  if (!inserted) throw new DuplicateOrder(input.client_order_id)
  const orderId = inserted.id

  const lineIds: string[] = []
  for (const [i, line] of input.lines.entries()) {
    const sel = selections[i]
    const price = priced.lines[i]
    if (!sel || !price) throw new Error('line index out of range')
    const disc = discounts.lines[i] ?? null
    const { id } = await q.insertLine(trx, {
      tenant_id: auth.tenantId,
      order_id: orderId,
      line_no: i + 1,
      item_id: sel.item.id,
      item_name: sel.item.name,
      category_name: sel.item.category_name,
      unit_price: sel.item.price,
      modifiers_unit_total: price.modifiersUnitTotal,
      qty: line.qty,
      line_gross: price.lineGross,
      discount_id: disc?.id ?? null,
      discount_name: disc?.name ?? null,
      discount_kind: disc?.discount.kind ?? null,
      discount_value: disc?.discount.value ?? null,
      discount_amount: price.discountAmount,
      line_net: price.lineNet,
      note: textOrNull(line.note),
    })
    lineIds.push(id)
    await q.insertLineModifiers(
      trx,
      sel.options.map((o, index) => ({
        tenant_id: auth.tenantId,
        order_line_id: id,
        seq: index + 1,
        option_id: o.id,
        group_name: o.group_name,
        option_name: o.name,
        price_delta: o.price_delta,
      })),
    )
  }
  await q.insertPayments(
    trx,
    input.payments.map((p, i) => ({
      tenant_id: auth.tenantId,
      order_id: orderId,
      seq: i + 1,
      method: p.method,
      amount: BigInt(p.amount),
      tendered: p.tendered === undefined || p.tendered === null ? null : BigInt(p.tendered),
      provider: textOrNull(p.provider),
      reference: textOrNull(p.reference),
    })),
  )

  // 7. Resolve ingredients per line and aggregate.
  const perLine: Map<string, bigint>[] = []
  for (const line of input.lines) {
    perLine.push(await resolveLine(trx, auth.tenantId, line.item_id, line.option_ids ?? [], line.qty))
  }
  const totals = new Map<string, bigint>()
  for (const m of perLine) for (const [id, qty] of m) totals.set(id, (totals.get(id) ?? 0n) + qty)

  // 8–9. Lock in ascending id order, deduct, record movements. Stock may go negative.
  const locked = await lockIngredients(trx, auth.tenantId, [...totals.keys()])
  for (const id of [...totals.keys()].sort()) {
    const ingredient = locked.get(id) as LockedIngredient
    await applyMovement(trx, {
      tenantId: auth.tenantId,
      userId: auth.userId,
      ingredient,
      qtyDelta: -(totals.get(id) ?? 0n),
      movement: { type: 'sale', orderId, unitCost: ingredient.avgCost },
    })
  }

  // 10. COGS at the average cost the sale was recorded at.
  let cogs = 0n
  for (const [i, m] of perLine.entries()) {
    let lineCogs = 0n
    for (const [id, qty] of m) lineCogs += costOf(qty, (locked.get(id) as LockedIngredient).avgCost)
    cogs += lineCogs
    const lineId = lineIds[i]
    if (lineId && lineCogs > 0n) await q.setLineCogs(trx, auth.tenantId, lineId, formatCost(lineCogs))
  }
  const cogsTotal = toRupiah(cogs)
  if (cogsTotal > 0n) await q.setOrderCogs(trx, auth.tenantId, orderId, cogsTotal)

  // 11. Low-stock alerts for everything this sale touched.
  await checkLowStock(trx, config, auth.tenantId, locked.values())

  if (discounts.custom()) {
    await writeAudit(trx, {
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: 'order.custom_discount',
      entityType: 'order',
      entityId: orderId,
      data: {
        order:
          discounts.order?.id === null
            ? { kind: discounts.order.discount.kind, value: money(discounts.order.discount.value) }
            : null,
        lines: discounts.lines.flatMap((d, i) =>
          d && d.id === null
            ? [{ line_no: i + 1, kind: d.discount.kind, value: money(d.discount.value) }]
            : [],
        ),
      },
    })
  }

  return { created: true, order: await loadOrder(trx, auth, orderId) }
}
