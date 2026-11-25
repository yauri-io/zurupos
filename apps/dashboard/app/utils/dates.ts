// Business dates (SPEC §12.1) and the date-range presets (§12.3). Dates are
// "YYYY-MM-DD" strings; arithmetic is done on UTC midnights so no time zone or
// daylight-saving shift can move a day.

export type DateRange = { from: string; to: string }
export type Preset =
  'today' | 'yesterday' | 'last7' | 'this_month' | 'last_month' | 'weeks4' | 'weeks8' | 'weeks12' | 'last30'
export const PRESETS: Preset[] = ['today', 'yesterday', 'last7', 'this_month', 'last_month']
// Whole weeks ending yesterday, so every weekday occurs equally often (SPEC §12.4).
export const WEEK_PRESETS: Preset[] = ['weeks4', 'weeks8', 'weeks12']
// Menu matrix (SPEC §12.5): complete days only, so today's half day doesn't skew it.
export const MATRIX_PRESETS: Preset[] = ['last30', 'last_month', 'weeks12']

// The shop's business date at `now`: local date of (now − cutoff hours).
export const businessToday = (timezone: string, cutoffHour: number, now = new Date()): string => {
  const shifted = new Date(now.getTime() - cutoffHour * 3_600_000)
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted)
}

const toUtc = (day: string) => new Date(`${day}T00:00:00Z`)
const fromUtc = (d: Date) => d.toISOString().slice(0, 10)

export const addDays = (day: string, n: number): string => {
  const d = toUtc(day)
  d.setUTCDate(d.getUTCDate() + n)
  return fromUtc(d)
}

export const presetRange = (preset: Preset, today: string): DateRange => {
  const d = toUtc(today)
  const firstOfMonth = (y: number, m: number) => fromUtc(new Date(Date.UTC(y, m, 1)))
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) }
    case 'last7':
      return { from: addDays(today, -6), to: today }
    case 'this_month':
      return { from: firstOfMonth(y, m), to: today }
    case 'last_month':
      return { from: firstOfMonth(y, m - 1), to: addDays(firstOfMonth(y, m), -1) }
    case 'last30':
      return { from: addDays(today, -30), to: addDays(today, -1) }
    case 'weeks4':
    case 'weeks8':
    case 'weeks12': {
      const weeks = Number(preset.slice(5))
      return { from: addDays(today, -7 * weeks), to: addDays(today, -1) }
    }
  }
}

// Number of days in an inclusive range.
export const rangeDays = (r: DateRange): number =>
  Math.round((toUtc(r.to).getTime() - toUtc(r.from).getTime()) / 86_400_000) + 1

// "2026-11-28" → "28 Nov 2026" in the UI language.
export const formatDay = (day: string, locale: string): string =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(toUtc(day))

// An ISO timestamp in the shop's time zone, "28 Nov 2026 08.15".
export const formatDateTime = (iso: string, timezone: string, locale: string): string =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso))
