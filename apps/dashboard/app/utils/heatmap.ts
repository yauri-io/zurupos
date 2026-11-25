// Display helpers for the operational heatmap (SPEC §12.4). The API does the
// maths; this only names weekdays and hours, formats tenths and picks a shade.

// 2026-11-02 is a Monday: ISO weekday n is that date + (n − 1) days.
export const weekdayName = (weekday: number, locale: string, style: 'long' | 'short' = 'long'): string =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'id-ID', { weekday: style, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, 10, 1 + weekday)),
  )

// "09.00" in Indonesian, "09:00" in English.
export const hourLabel = (hour: number, locale: string): string =>
  `${String(hour).padStart(2, '0')}${locale === 'en' ? ':' : '.'}00`

// "09.00–10.00"; 23 → "23.00–00.00".
export const hourSpan = (hour: number, locale: string): string =>
  `${hourLabel(hour, locale)}–${hourLabel((hour + 1) % 24, locale)}`

// Average orders in tenths → "2,5" / "2.5".
export const formatTenths = (x10: number, locale: string): string =>
  `${Math.trunc(x10 / 10)}${locale === 'en' ? '.' : ','}${Math.abs(x10 % 10)}`

// Shade 0 (nothing) … 4 by rank among the non-empty cells, so one unusually
// big order doesn't wash every other cell out to the palest shade.
export const SHADES = 4
export const shader = (values: readonly number[]): ((value: number) => number) => {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b)
  return (value) => {
    if (value <= 0 || sorted.length === 0) return 0
    // Number of non-empty values ≤ value (sorted ascending).
    let atOrBelow = 0
    while (atOrBelow < sorted.length && (sorted[atOrBelow] ?? 0) <= value) atOrBelow++
    return Math.max(1, Math.ceil((atOrBelow * SHADES) / sorted.length))
  }
}
