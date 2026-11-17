import { describe, expect, it } from 'vitest'
import { addDays, businessToday, presetRange } from '../app/utils/dates'
import { exampleTotals } from '../app/utils/pricing'

describe('businessToday', () => {
  it('uses the shop time zone', () => {
    // 2026-11-27 18:30 UTC = 2026-11-28 01:30 in Jakarta.
    expect(businessToday('Asia/Jakarta', 0, new Date('2026-11-27T18:30:00Z'))).toBe('2026-11-28')
  })
  it('counts orders before the cutoff to the previous day', () => {
    expect(businessToday('Asia/Jakarta', 3, new Date('2026-11-27T18:30:00Z'))).toBe('2026-11-27')
    expect(businessToday('Asia/Jakarta', 3, new Date('2026-11-27T20:00:00Z'))).toBe('2026-11-28')
  })
})

describe('presets', () => {
  it.each([
    ['today', '2026-11-28', '2026-11-28'],
    ['yesterday', '2026-11-27', '2026-11-27'],
    ['last7', '2026-11-22', '2026-11-28'],
    ['this_month', '2026-11-01', '2026-11-28'],
    ['last_month', '2026-10-01', '2026-10-31'],
  ] as const)('%s', (preset, from, to) => {
    expect(presetRange(preset, '2026-11-28')).toEqual({ from, to })
  })
  it('last month across a year boundary and a leap February', () => {
    expect(presetRange('last_month', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(presetRange('last_month', '2028-03-01')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
  it('addDays crosses months', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('exampleTotals (settings live example)', () => {
  const base = { service_charge_enabled: true, service_charge_bps: 500, tax_enabled: true, tax_bps: 1000 }
  it('tax on service charge', () => {
    expect(exampleTotals(100000, { ...base, tax_on_service_charge: true })).toEqual({
      net: 100000,
      service: 5000,
      tax: 10500,
      total: 115500,
    })
  })
  it('tax on net only, half-up', () => {
    expect(exampleTotals(25005, { ...base, tax_on_service_charge: false })).toEqual({
      net: 25005,
      service: 1250, // 1250.25
      tax: 2501, // 2500.5
      total: 28756,
    })
  })
})
