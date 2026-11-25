// The dashboard's one IDR formatter (CLAUDE.md): whole rupiah → "Rp 25.000".
// Money arrives from the API as an integer number of rupiah (D-028).
const grouping = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export const formatIdr = (rupiah: number): string => {
  if (!Number.isSafeInteger(rupiah)) throw new Error(`formatIdr: not a whole rupiah amount: ${rupiah}`)
  const sign = rupiah < 0 ? '-' : ''
  return `${sign}Rp ${grouping.format(Math.abs(rupiah))}`
}

// Short amount for tight spaces such as heatmap cells (D-077): "850", "4,5rb",
// "45rb", "1,2jt", "12jt" ("4.5k", "45k", "1.2M" in English). Integers only,
// rounded half up; one decimal below 10 of a unit, whole units from 10 up.
// Not for totals people copy or check: use formatIdr there.
const halfUp = (a: number, b: number) => Math.floor((2 * a + b) / (2 * b))

export const formatIdrShort = (rupiah: number, locale: string): string => {
  if (!Number.isSafeInteger(rupiah)) throw new Error(`formatIdrShort: not a whole rupiah amount: ${rupiah}`)
  const sign = rupiah < 0 ? '-' : ''
  const v = Math.abs(rupiah)
  const en = locale === 'en'
  const tenths = (x10: number, unit: string) =>
    `${sign}${Math.trunc(x10 / 10)}${x10 % 10 ? `${en ? '.' : ','}${x10 % 10}` : ''}${unit}`
  if (v < 1000) return `${sign}${v}`
  const [k, m] = en ? ['k', 'M'] : ['rb', 'jt']
  if (halfUp(v, 100) < 100) return tenths(halfUp(v, 100), k)
  if (halfUp(v, 1000) < 1000) return `${sign}${halfUp(v, 1000)}${k}`
  if (halfUp(v, 100_000) < 100) return tenths(halfUp(v, 100_000), m)
  return `${sign}${halfUp(v, 1_000_000)}${m}`
}

// Parses what a person typed ("25.000", "Rp 25000", "25000") into whole rupiah.
// Returns null for anything that isn't a plain non-negative amount.
export const parseRupiah = (input: string): number | null => {
  const digits = input.replace(/^\s*rp\.?\s*/i, '').replace(/[.\s]/g, '')
  if (!/^\d{1,12}$/.test(digits)) return null
  return Number(digits)
}

// Basis points → "10%", "2,5%".
export const formatBps = (bps: number): string => {
  const whole = Math.trunc(bps / 100)
  const frac = String(bps % 100)
    .padStart(2, '0')
    .replace(/0+$/, '')
  return `${whole}${frac ? `,${frac}` : ''}%`
}

// "10" / "2,5" / "2.5" percent → basis points, or null.
export const parsePercentToBps = (input: string): number | null => {
  const match = /^\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*%?\s*$/.exec(input)
  if (!match) return null
  const bps = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0')
  return bps <= 10_000 ? bps : null
}
