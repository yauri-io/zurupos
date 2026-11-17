// SPEC §6: pricing as pure functions over bigint rupiah. No floats anywhere.
// The Dart port (apps/cashier/lib/domain/pricing.dart) must match it exactly;
// both run test/fixtures/pricing-cases.json.

export type Discount = { kind: 'percent' | 'fixed'; value: bigint }

export type PricingSettings = {
  serviceChargeEnabled: boolean
  serviceChargeBps: number
  taxEnabled: boolean
  taxBps: number
  taxOnServiceCharge: boolean
}

export type LineInput = {
  unitPrice: bigint
  optionDeltas: readonly bigint[]
  qty: number
  discount: Discount | null
}

export type PricedLine = {
  modifiersUnitTotal: bigint
  unitTotal: bigint
  lineGross: bigint
  discountAmount: bigint
  lineNet: bigint
}

export type PricedOrder = {
  lines: PricedLine[]
  subtotal: bigint
  itemDiscountTotal: bigint
  orderDiscountAmount: bigint
  netSales: bigint
  serviceChargeAmount: bigint
  taxAmount: bigint
  total: bigint
}

// §6.1: half-up percentage of a non-negative amount.
export const pct = (amount: bigint, bps: number): bigint => {
  if (amount < 0n) throw new Error('pct: amount must be non-negative')
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error('pct: bps out of range')
  return (amount * BigInt(bps) + 5000n) / 10000n
}

const min = (a: bigint, b: bigint) => (a < b ? a : b)

const discountAmount = (base: bigint, discount: Discount | null, units: bigint): bigint => {
  if (discount === null) return 0n
  if (discount.kind === 'percent') return pct(base, Number(discount.value))
  return min(discount.value * units, base)
}

// §6.2
export const priceLine = (line: LineInput): PricedLine => {
  if (!Number.isInteger(line.qty) || line.qty < 1)
    throw new Error('priceLine: qty must be a positive integer')
  const qty = BigInt(line.qty)
  const modifiersUnitTotal = line.optionDeltas.reduce((sum, d) => sum + d, 0n)
  const unitTotal = line.unitPrice + modifiersUnitTotal
  const lineGross = unitTotal * qty
  // A fixed item discount is per unit, capped at the line.
  const amount = discountAmount(lineGross, line.discount, qty)
  return { modifiersUnitTotal, unitTotal, lineGross, discountAmount: amount, lineNet: lineGross - amount }
}

// §6.3
export const priceOrder = (
  lines: readonly LineInput[],
  orderDiscount: Discount | null,
  settings: PricingSettings,
): PricedOrder => {
  const priced = lines.map(priceLine)
  const subtotal = priced.reduce((s, l) => s + l.lineGross, 0n)
  const itemDiscountTotal = priced.reduce((s, l) => s + l.discountAmount, 0n)
  const afterItems = subtotal - itemDiscountTotal
  const orderDiscountAmount = discountAmount(afterItems, orderDiscount, 1n)
  const netSales = afterItems - orderDiscountAmount
  const serviceChargeAmount = settings.serviceChargeEnabled ? pct(netSales, settings.serviceChargeBps) : 0n
  const taxBase = netSales + (settings.taxOnServiceCharge ? serviceChargeAmount : 0n)
  const taxAmount = settings.taxEnabled ? pct(taxBase, settings.taxBps) : 0n
  return {
    lines: priced,
    subtotal,
    itemDiscountTotal,
    orderDiscountAmount,
    netSales,
    serviceChargeAmount,
    taxAmount,
    total: netSales + serviceChargeAmount + taxAmount,
  }
}

export type PaymentInput = { method: string; amount: bigint; tendered: bigint | null }

export type PaymentCheck =
  | { ok: true; changeDue: bigint }
  | { ok: false; code: 'PAYMENT_MISMATCH' | 'VALIDATION' | 'METHOD_DISABLED'; index?: number }

// §6.4 (+ D-025: cash lines must carry tendered).
export const checkPayments = (
  total: bigint,
  payments: readonly PaymentInput[],
  enabledMethods: readonly string[],
): PaymentCheck => {
  if (total === 0n && payments.length === 0) return { ok: true, changeDue: 0n }
  for (const [index, p] of payments.entries()) {
    if (!enabledMethods.includes(p.method)) return { ok: false, code: 'METHOD_DISABLED', index }
    if (p.amount <= 0n) return { ok: false, code: 'VALIDATION', index }
    if (p.method === 'cash') {
      if (p.tendered === null || p.tendered < p.amount) return { ok: false, code: 'VALIDATION', index }
    } else if (p.tendered !== null) {
      return { ok: false, code: 'VALIDATION', index }
    }
  }
  const paid = payments.reduce((s, p) => s + p.amount, 0n)
  if (paid !== total) return { ok: false, code: 'PAYMENT_MISMATCH' }
  const changeDue = payments.reduce(
    (s, p) => (p.method === 'cash' && p.tendered !== null ? s + (p.tendered - p.amount) : s),
    0n,
  )
  return { ok: true, changeDue }
}
