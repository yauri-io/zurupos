// Operational heatmap (SPEC §12.4, D-071): weekday × hour averages per trading
// day, the hours in business-day order, and the busiest / quietest cell.
// Pure function over the aggregated rows; integers only.
import { divHalfUp } from './decimal.js'

// Weeks of data per weekday below which the pattern is flagged as unreliable.
export const MIN_RELIABLE_WEEKS = 3

export type HeatmapRow = {
  weekday: number // ISO weekday of the business date, 1 = Monday … 7 = Sunday
  hour: number // local hour of paid_at, 0–23
  orders: bigint
  netSales: bigint
}

export type HeatmapInput = {
  cutoffHour: number
  // ISO weekday → business dates in range with at least one paid order.
  tradingDays: ReadonlyMap<number, number>
  rows: readonly HeatmapRow[]
}

export type HeatmapCell = {
  hour: number
  orders: bigint
  netSales: bigint
  avgOrdersX10: bigint // average orders per trading day, in tenths
  avgNetSales: bigint // average net sales per trading day, whole rupiah
}

export type HeatmapWeekday = { weekday: number; tradingDays: number; cells: (HeatmapCell | null)[] }
export type Peak = { weekday: number; hour: number; avg: bigint }
export type Insight = { busiest: Peak; quietest: Peak; ratio: bigint | null }

export type Heatmap = {
  hours: number[]
  weekdays: HeatmapWeekday[]
  weeksOfData: number
  reliable: boolean
  insight: { orders: Insight | null; netSales: Insight | null }
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

// cutoff … 23, then 0 … cutoff − 1: hours after midnight stay with their business day.
export const businessHours = (cutoffHour: number): number[] => {
  if (!Number.isInteger(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) {
    throw new Error(`businessHours: bad cutoff hour ${cutoffHour}`)
  }
  return Array.from({ length: 24 }, (_, i) => (cutoffHour + i) % 24)
}

const insightFor = (weekdays: HeatmapWeekday[], avgOf: (c: HeatmapCell) => bigint): Insight | null => {
  let busiest: Peak | null = null
  let quietest: Peak | null = null
  // Weekday order, then display-hour order; strict comparisons keep the earlier cell on ties.
  for (const w of weekdays) {
    for (const c of w.cells) {
      if (!c) continue
      const avg = avgOf(c)
      if (!busiest || avg > busiest.avg) busiest = { weekday: w.weekday, hour: c.hour, avg }
      if (avg > 0n && (!quietest || avg < quietest.avg)) quietest = { weekday: w.weekday, hour: c.hour, avg }
    }
  }
  if (!busiest || !quietest || busiest.avg === 0n) return null
  // Compared exactly (1.6× must not round up to "2×"); the shown ratio is rounded.
  const ratio = busiest.avg >= 2n * quietest.avg ? divHalfUp(busiest.avg, quietest.avg) : null
  return { busiest, quietest, ratio }
}

export const buildHeatmap = ({ cutoffHour, tradingDays, rows }: HeatmapInput): Heatmap => {
  const order = businessHours(cutoffHour)
  const byKey = new Map<string, HeatmapRow>()
  for (const r of rows) {
    if (!WEEKDAYS.includes(r.weekday) || !order.includes(r.hour)) {
      throw new Error(`buildHeatmap: bad cell ${r.weekday}/${r.hour}`)
    }
    if ((tradingDays.get(r.weekday) ?? 0) <= 0) {
      throw new Error(`buildHeatmap: orders on weekday ${r.weekday} without trading days`)
    }
    byKey.set(`${r.weekday}:${r.hour}`, r)
  }

  // Only the span from the first to the last hour with any order.
  const used = order.map((h) => rows.some((r) => r.hour === h))
  const first = used.indexOf(true)
  const hours = first < 0 ? [] : order.slice(first, used.lastIndexOf(true) + 1)

  const weekdays = WEEKDAYS.map((weekday): HeatmapWeekday => {
    const days = tradingDays.get(weekday) ?? 0
    const cells = hours.map((hour): HeatmapCell | null => {
      if (days <= 0) return null
      const r = byKey.get(`${weekday}:${hour}`)
      const orders = r?.orders ?? 0n
      const netSales = r?.netSales ?? 0n
      const d = BigInt(days)
      return {
        hour,
        orders,
        netSales,
        avgOrdersX10: divHalfUp(orders * 10n, d),
        avgNetSales: divHalfUp(netSales, d),
      }
    })
    return { weekday, tradingDays: days, cells }
  })

  const traded = weekdays.filter((w) => w.tradingDays > 0).map((w) => w.tradingDays)
  const weeksOfData = traded.length === 0 ? 0 : Math.min(...traded)
  const reliable = weeksOfData >= MIN_RELIABLE_WEEKS
  return {
    hours,
    weekdays,
    weeksOfData,
    reliable,
    insight: reliable
      ? {
          orders: insightFor(weekdays, (c) => c.avgOrdersX10),
          netSales: insightFor(weekdays, (c) => c.avgNetSales),
        }
      : { orders: null, netSales: null },
  }
}
