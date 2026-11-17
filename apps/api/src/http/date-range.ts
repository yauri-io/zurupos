import { apiError } from './errors.js'

export const MAX_RANGE_DAYS = 366
const DAY_MS = 86_400_000

export type DateRange = { from: string; to: string }

// Inclusive business-date range: calendar-valid YYYY-MM-DD, from ≤ to, at most
// a year (plus a leap day).
export const checkRange = (query: DateRange): DateRange => {
  const from = Date.parse(`${query.from}T00:00:00Z`)
  const to = Date.parse(`${query.to}T00:00:00Z`)
  const valid = (s: string, t: number) => !Number.isNaN(t) && new Date(t).toISOString().startsWith(s)
  if (!valid(query.from, from) || !valid(query.to, to)) {
    throw apiError('VALIDATION', { field: 'from', problem: 'invalid_date' })
  }
  if (to < from) throw apiError('VALIDATION', { field: 'to', problem: 'before_from' })
  if ((to - from) / DAY_MS + 1 > MAX_RANGE_DAYS) {
    throw apiError('VALIDATION', { field: 'to', problem: 'range_too_long', max_days: MAX_RANGE_DAYS })
  }
  return { from: query.from, to: query.to }
}
