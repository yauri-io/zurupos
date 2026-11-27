// The package's one IDR formatter: whole rupiah → "Rp 25.000" (CLAUDE.md).
const grouping = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

export const formatIdr = (rupiah: number): string => {
  if (!Number.isSafeInteger(rupiah)) throw new Error(`formatIdr: not a whole rupiah amount: ${rupiah}`)
  const sign = rupiah < 0 ? '-' : ''
  return `${sign}Rp ${grouping.format(Math.abs(rupiah))}`
}
