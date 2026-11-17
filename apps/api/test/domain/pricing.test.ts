// SPEC §6 — every shared fixture (also run by the Dart engine in M4).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkPayments, pct, priceOrder, type Discount } from '../../src/domain/pricing.js'

type FixtureDiscount = { kind: 'percent' | 'fixed'; value: number }
type Fixture = {
  name: string
  settings: {
    service_charge_enabled: boolean
    service_charge_bps: number
    tax_enabled: boolean
    tax_bps: number
    tax_on_service_charge: boolean
  }
  lines: { unit_price: number; qty: number; option_deltas: number[]; discount?: FixtureDiscount }[]
  order_discount?: FixtureDiscount
  payments?: { method: string; amount: number; tendered?: number | null }[]
  enabled_payment_methods?: string[]
  expected: {
    lines: {
      modifiers_unit_total: number
      unit_total: number
      line_gross: number
      discount_amount: number
      line_net: number
    }[]
    subtotal: number
    item_discount_total: number
    order_discount_amount: number
    net_sales: number
    service_charge_amount: number
    tax_amount: number
    total: number
    payments?: { change_due: number } | { error: string }
  }
}

const { cases } = JSON.parse(
  readFileSync(new URL('../fixtures/pricing-cases.json', import.meta.url), 'utf8'),
) as { cases: Fixture[] }

const discount = (d: FixtureDiscount | undefined): Discount | null =>
  d ? { kind: d.kind, value: BigInt(d.value) } : null

describe('pricing fixtures', () => {
  it('has at least 40 cases (SPEC §6)', () => {
    expect(cases.length).toBeGreaterThanOrEqual(40)
  })

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const result = priceOrder(
      c.lines.map((l) => ({
        unitPrice: BigInt(l.unit_price),
        optionDeltas: l.option_deltas.map(BigInt),
        qty: l.qty,
        discount: discount(l.discount),
      })),
      discount(c.order_discount),
      {
        serviceChargeEnabled: c.settings.service_charge_enabled,
        serviceChargeBps: c.settings.service_charge_bps,
        taxEnabled: c.settings.tax_enabled,
        taxBps: c.settings.tax_bps,
        taxOnServiceCharge: c.settings.tax_on_service_charge,
      },
    )
    const asNumbers = {
      lines: result.lines.map((l) => ({
        modifiers_unit_total: Number(l.modifiersUnitTotal),
        unit_total: Number(l.unitTotal),
        line_gross: Number(l.lineGross),
        discount_amount: Number(l.discountAmount),
        line_net: Number(l.lineNet),
      })),
      subtotal: Number(result.subtotal),
      item_discount_total: Number(result.itemDiscountTotal),
      order_discount_amount: Number(result.orderDiscountAmount),
      net_sales: Number(result.netSales),
      service_charge_amount: Number(result.serviceChargeAmount),
      tax_amount: Number(result.taxAmount),
      total: Number(result.total),
    }
    const { payments: expectedPayments, ...expectedTotals } = c.expected
    expect(asNumbers).toEqual(expectedTotals)

    if (c.payments && expectedPayments) {
      const check = checkPayments(
        result.total,
        c.payments.map((p) => ({
          method: p.method,
          amount: BigInt(p.amount),
          tendered: p.tendered === undefined || p.tendered === null ? null : BigInt(p.tendered),
        })),
        c.enabled_payment_methods ?? [],
      )
      expect(check.ok ? { change_due: Number(check.changeDue) } : { error: check.code }).toEqual(
        expectedPayments,
      )
    }
  })
})

describe('pct', () => {
  it('rounds half up', () => {
    expect(pct(5n, 1000)).toBe(1n) // 0.5 → 1
    expect(pct(4n, 1000)).toBe(0n) // 0.4 → 0
    expect(pct(15n, 1000)).toBe(2n) // 1.5 → 2
  })

  it('rejects negative amounts and out-of-range bps', () => {
    expect(() => pct(-1n, 100)).toThrow()
    expect(() => pct(1n, 10_001)).toThrow()
    expect(() => pct(1n, 1.5)).toThrow()
  })
})
