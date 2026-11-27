// Pure helpers for the online menu page (SPEC §12.7, D-080). The API checks the
// same rules; these only help the owner type valid values.

// Same pattern as the API: 3–40 characters, a-z, 0-9 and single inner hyphens.
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/

// "Kopi Senja & Roti" → "kopi-senja-roti"; accents removed, never longer than 40.
export const suggestSlug = (name: string): string => {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  if (base.length >= 3) return base
  return base === '' ? 'menu-toko' : `${base}-menu`.slice(0, 40)
}

// What the owner types → the API's `62…` digits. 0812…, +62 812…, 62-812… all
// work; returns null for empty and 'invalid' when it can't be a phone number.
export const normalizeWhatsapp = (input: string): string | null | 'invalid' => {
  const digits = input.replace(/[\s\-().+]/g, '')
  if (digits === '') return null
  if (!/^[0-9]+$/.test(digits)) return 'invalid'
  const national = digits.startsWith('62')
    ? digits.slice(2)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits
  const full = `62${national}`
  return /^62[0-9]{8,13}$/.test(full) ? full : 'invalid'
}

// "@Kopi.Senja" or an instagram.com link → "kopi.senja".
export const normalizeInstagram = (input: string): string | null | 'invalid' => {
  let handle = input.trim()
  if (handle === '') return null
  const link = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i.exec(handle)
  if (link?.[1]) handle = link[1]
  handle = handle.replace(/^@/, '').toLowerCase()
  return /^[a-z0-9._]{1,30}$/.test(handle) ? handle : 'invalid'
}

// Shown in the form as the owner typed it, so 6281… reads as 0812….
export const whatsappForDisplay = (digits: string | null): string => (digits ? `0${digits.slice(2)}` : '')

// Size that fits inside `max` on the long side, never larger than the original.
export const fitWithin = (width: number, height: number, max: number) => {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

// The seven rows of the hours form, Monday first (weekday 1 … 7).
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

export type HoursRow = { weekday: number; open: boolean; opens: string; closes: string }

export const hoursRows = (saved: { weekday: number; opens: string; closes: string }[]): HoursRow[] =>
  WEEKDAYS.map((weekday) => {
    const row = saved.find((h) => h.weekday === weekday)
    return row
      ? { weekday, open: true, opens: row.opens, closes: row.closes }
      : { weekday, open: false, opens: '08:00', closes: '21:00' }
  })

export const hoursBody = (rows: HoursRow[]) =>
  rows.filter((r) => r.open).map(({ weekday, opens, closes }) => ({ weekday, opens, closes }))
