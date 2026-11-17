export const iso = (d: Date): string => d.toISOString()
export const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null)

// bigint rupiah → JSON integer. Values are bounded by MAX_MONEY on the way in,
// so this never loses precision; throw rather than round if that is ever violated.
export const money = (value: bigint): number => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('money value exceeds the safe integer range')
  }
  return Number(value)
}
