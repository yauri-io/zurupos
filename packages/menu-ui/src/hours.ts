// "Hari ini 07.00–22.00" by calendar day in the shop's timezone (SPEC §12.7).
// Never a live "open now" (D-078): weekly hours can't know one-off closures.
import { translate, type Locale } from './i18n'

export type Hours = { weekday: number; opens: string; closes: string }

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

// ISO weekday (1 = Monday … 7) of `now` in `timeZone`.
export const weekdayIn = (now: Date, timeZone: string): number => {
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now)
  const day = WEEKDAYS[short]
  if (day === undefined) throw new Error(`unexpected weekday ${short}`)
  return day
}

// 07:00 → "07.00" in Indonesian, "07:00" in English.
export const formatTime = (time: string, locale: Locale): string =>
  locale === 'id' ? time.replace(':', '.') : time

// A range past midnight reads as it is: 18.00–01.00.
export const formatRange = (h: Hours, locale: Locale): string =>
  `${formatTime(h.opens, locale)}–${formatTime(h.closes, locale)}`

// null when the shop set no hours at all (the section is then left out).
export const todayLine = (
  hours: readonly Hours[],
  timeZone: string,
  now: Date,
  locale: Locale,
): string | null => {
  if (hours.length === 0) return null
  const today = hours.find((h) => h.weekday === weekdayIn(now, timeZone))
  return today
    ? translate(locale, 'today', { range: formatRange(today, locale) })
    : translate(locale, 'closed_today')
}

// Seven rows, Monday first; days without hours are closed.
export const weekRows = (hours: readonly Hours[], locale: Locale) =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const h = hours.find((x) => x.weekday === weekday)
    return {
      weekday,
      day: translate(locale, `weekday_${weekday}` as `weekday_${1 | 2 | 3 | 4 | 5 | 6 | 7}`),
      range: h ? formatRange(h, locale) : translate(locale, 'closed'),
      open: h !== undefined,
    }
  })
