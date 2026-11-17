// The dashboard's one IDR formatter (CLAUDE.md): whole rupiah → "Rp 25.000".
// Money arrives from the API as an integer number of rupiah (D-028).
const grouping = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export const formatIdr = (rupiah: number): string => {
  if (!Number.isSafeInteger(rupiah)) throw new Error(`formatIdr: not a whole rupiah amount: ${rupiah}`)
  const sign = rupiah < 0 ? '-' : ''
  return `${sign}Rp ${grouping.format(Math.abs(rupiah))}`
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
