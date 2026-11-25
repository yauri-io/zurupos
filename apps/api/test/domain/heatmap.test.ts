import { describe, expect, it } from 'vitest'
import { buildHeatmap, businessHours, type HeatmapRow } from '../../src/domain/heatmap.js'

const row = (weekday: number, hour: number, orders: number, netSales: number): HeatmapRow => ({
  weekday,
  hour,
  orders: BigInt(orders),
  netSales: BigInt(netSales),
})
const days = (entries: [number, number][]) => new Map(entries)

describe('businessHours (SPEC §12.4)', () => {
  it('starts at the cutoff hour and wraps after midnight', () => {
    expect(businessHours(0)).toEqual([...Array(24).keys()])
    expect(businessHours(2).slice(0, 2)).toEqual([2, 3])
    expect(businessHours(2).slice(-3)).toEqual([23, 0, 1])
  })
  it('rejects a bad cutoff', () => {
    expect(() => businessHours(24)).toThrow()
    expect(() => businessHours(-1)).toThrow()
  })
})

describe('buildHeatmap (SPEC §12.4, D-071)', () => {
  it('averages per trading day, so 5 Mondays are not busier than 4 Tuesdays', () => {
    // 50 orders over 5 Mondays and 40 over 4 Tuesdays: both average 10.
    const h = buildHeatmap({
      cutoffHour: 0,
      tradingDays: days([
        [1, 5],
        [2, 4],
      ]),
      rows: [row(1, 9, 50, 1_000_000), row(2, 9, 40, 800_000)],
    })
    expect(h.weekdays[0]?.cells[0]).toMatchObject({ avgOrdersX10: 100n, avgNetSales: 200_000n })
    expect(h.weekdays[1]?.cells[0]).toMatchObject({ avgOrdersX10: 100n, avgNetSales: 200_000n })
  })

  it('rounds averages half up', () => {
    // 7 orders / 4 days = 1.75 → 17.5 tenths → 18; Rp 10 / 4 = 2.5 → 3.
    const h = buildHeatmap({ cutoffHour: 0, tradingDays: days([[3, 4]]), rows: [row(3, 10, 7, 10)] })
    expect(h.weekdays[2]?.cells[0]).toMatchObject({ avgOrdersX10: 18n, avgNetSales: 3n })
  })

  it('keeps hours after midnight at the end of their business day (cutoff 2)', () => {
    const h = buildHeatmap({
      cutoffHour: 2,
      tradingDays: days([[5, 1]]),
      rows: [row(5, 21, 1, 1000), row(5, 1, 2, 2000)],
    })
    expect(h.hours).toEqual([21, 22, 23, 0, 1])
    expect(h.weekdays[4]?.cells.map((c) => c?.orders)).toEqual([1n, 0n, 0n, 0n, 2n])
  })

  it('returns null cells for a weekday without trading days and 0 for empty hours', () => {
    const h = buildHeatmap({
      cutoffHour: 0,
      tradingDays: days([[2, 1]]),
      rows: [row(2, 8, 1, 100), row(2, 10, 1, 100)],
    })
    expect(h.hours).toEqual([8, 9, 10])
    expect(h.weekdays[0]).toEqual({ weekday: 1, tradingDays: 0, cells: [null, null, null] })
    expect(h.weekdays[1]?.cells[1]).toMatchObject({ hour: 9, orders: 0n, avgOrdersX10: 0n })
  })

  it('has no hours and no insight without orders', () => {
    const h = buildHeatmap({ cutoffHour: 0, tradingDays: days([]), rows: [] })
    expect(h.hours).toEqual([])
    expect(h.weekdays).toHaveLength(7)
    expect(h.weeksOfData).toBe(0)
    expect(h.reliable).toBe(false)
    expect(h.insight).toEqual({ orders: null, netSales: null })
  })

  it('is reliable from 3 weeks of data on every trading weekday, and only then has an insight', () => {
    const rows = [row(6, 15, 9, 900_000), row(2, 13, 3, 300_000)]
    const two = buildHeatmap({
      cutoffHour: 0,
      tradingDays: days([
        [6, 3],
        [2, 2],
      ]),
      rows,
    })
    expect(two).toMatchObject({ weeksOfData: 2, reliable: false, insight: { orders: null, netSales: null } })

    const three = buildHeatmap({
      cutoffHour: 0,
      tradingDays: days([
        [6, 3],
        [2, 3],
      ]),
      rows,
    })
    expect(three.weeksOfData).toBe(3)
    expect(three.reliable).toBe(true)
    // Saturday 15:00 averages 3 orders, Tuesday 13:00 averages 1: three times busier.
    expect(three.insight.orders).toEqual({
      busiest: { weekday: 6, hour: 15, avg: 30n },
      quietest: { weekday: 2, hour: 13, avg: 10n },
      ratio: 3n,
    })
    expect(three.insight.netSales).toEqual({
      busiest: { weekday: 6, hour: 15, avg: 300_000n },
      quietest: { weekday: 2, hour: 13, avg: 100_000n },
      ratio: 3n,
    })
  })

  it('ignores empty cells for the quietest, breaks ties by weekday then hour, and drops a ratio below 2', () => {
    const h = buildHeatmap({
      cutoffHour: 0,
      tradingDays: days([
        [1, 3],
        [3, 3],
      ]),
      rows: [row(3, 9, 6, 600), row(1, 10, 6, 600), row(1, 8, 4, 400), row(3, 8, 4, 400)],
    })
    // Hours 8–10; Monday 9:00 and Wednesday 10:00 are 0 and don't count as quietest.
    expect(h.insight.orders).toEqual({
      busiest: { weekday: 1, hour: 10, avg: 20n },
      quietest: { weekday: 1, hour: 8, avg: 13n },
      ratio: null,
    })
  })

  it('rejects rows that do not fit the trading days', () => {
    expect(() => buildHeatmap({ cutoffHour: 0, tradingDays: days([]), rows: [row(1, 9, 1, 1)] })).toThrow()
    expect(() =>
      buildHeatmap({ cutoffHour: 0, tradingDays: days([[8, 1]]), rows: [row(8, 9, 1, 1)] }),
    ).toThrow()
  })
})
