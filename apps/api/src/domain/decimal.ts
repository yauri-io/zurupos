// Fixed-point decimals for quantities and unit costs. Postgres `numeric` values
// travel as strings; the domain works on scaled bigints so no float is involved.
// qty: numeric(14,3) → thousandths. cost: numeric(16,4) → ten-thousandths.

export const QTY_SCALE = 3
export const COST_SCALE = 4

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/

// Parses a decimal string at a fixed scale. Rejects more fractional digits than
// the scale allows instead of rounding them away.
export const parseFixed = (value: string, scale: number): bigint => {
  const match = DECIMAL.exec(value.trim())
  if (!match) throw new Error(`not a decimal: ${value}`)
  const [, sign, whole = '0', frac = ''] = match
  const trimmed = frac.replace(/0+$/, '')
  if (trimmed.length > scale) throw new Error(`too many decimal places: ${value}`)
  const scaled = BigInt(whole) * 10n ** BigInt(scale) + BigInt(trimmed.padEnd(scale, '0') || '0')
  return sign ? -scaled : scaled
}

// Formats a scaled bigint as a canonical decimal string without trailing zeros.
export const formatFixed = (value: bigint, scale: number): string => {
  const negative = value < 0n
  const abs = negative ? -value : value
  const unit = 10n ** BigInt(scale)
  const whole = abs / unit
  const frac = (abs % unit).toString().padStart(scale, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`
}

export const parseQty = (value: string): bigint => parseFixed(value, QTY_SCALE)
export const formatQty = (value: bigint): string => formatFixed(value, QTY_SCALE)
export const parseCost = (value: string): bigint => parseFixed(value, COST_SCALE)
export const formatCost = (value: bigint): string => formatFixed(value, COST_SCALE)

// Half-up division for non-negative numerator and positive denominator.
export const divHalfUp = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator <= 0n) throw new Error('divHalfUp: denominator must be positive')
  if (numerator < 0n) throw new Error('divHalfUp: numerator must be non-negative')
  return (numerator * 2n + denominator) / (denominator * 2n)
}

// SPEC §12.4 `div` for any sign: floor((2a + b) / 2b), so halves round towards
// +∞ (−2.5 → −2) and negative margins round consistently with positive ones.
export const divRound = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator <= 0n) throw new Error('divRound: denominator must be positive')
  const n = numerator * 2n + denominator
  const d = denominator * 2n
  const q = n / d // truncates towards zero
  return n < 0n && q * d !== n ? q - 1n : q
}
