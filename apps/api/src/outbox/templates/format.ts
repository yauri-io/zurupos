// The API's one IDR formatter (CLAUDE.md), plus the date and percent formats the
// report emails use. Whole rupiah in, "Rp 25.000" out, same as the dashboard.
import type { EmailLocale } from './types.js'

const grouping = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export const formatIdr = (rupiah: bigint): string => {
  const sign = rupiah < 0n ? '-' : ''
  const abs = rupiah < 0n ? -rupiah : rupiah
  if (abs > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('formatIdr: amount out of range')
  return `${sign}Rp ${grouping.format(Number(abs))}`
}

const tag = (locale: EmailLocale) => (locale === 'en' ? 'en-GB' : 'id-ID')

// "Kamis, 26 November 2026" / "Thursday, 26 November 2026".
export const formatLongDay = (day: string, locale: EmailLocale): string =>
  new Intl.DateTimeFormat(tag(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))

// "Kamis, 26 Nov" for subjects.
export const formatShortDay = (day: string, locale: EmailLocale): string =>
  new Intl.DateTimeFormat(tag(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))

// "23–29 Nov" (same month) or "30 Nov – 6 Des".
export const formatSpan = (from: string, to: string, locale: EmailLocale): string => {
  const f = (day: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(tag(locale), { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
  return from.slice(0, 7) === to.slice(0, 7)
    ? `${f(from, { day: 'numeric' })}–${f(to, { day: 'numeric', month: 'short' })}`
    : `${f(from, { day: 'numeric', month: 'short' })} – ${f(to, { day: 'numeric', month: 'short' })}`
}

// Weekday name of an ISO weekday (1 = Monday).
export const weekdayName = (weekday: number, locale: EmailLocale): string =>
  new Intl.DateTimeFormat(tag(locale), { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, 10, 1 + weekday)), // 2026-11-02 is a Monday
  )

// "09.00–10.00" / "09:00–10:00".
export const hourSpan = (hour: number, locale: EmailLocale): string => {
  const sep = locale === 'en' ? ':' : '.'
  const h = (n: number) => `${String(n % 24).padStart(2, '0')}${sep}00`
  return `${h(hour)}–${h(hour + 1)}`
}

// Signed whole percent: "+12%", "-5%", "0%".
export const formatPct = (pct: bigint): string => `${pct > 0n ? '+' : ''}${pct}%`
