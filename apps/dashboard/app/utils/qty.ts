// Quantities travel as decimal strings ("1500.5", D-028); they're shown in the
// Indonesian style ("1.500,5") without ever becoming a float.
export const formatQty = (value: string, unit?: string): string => {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(value)
  if (!match) return value
  const [, sign = '', whole = '0', frac = ''] = match
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const text = `${sign}${grouped}${frac ? `,${frac}` : ''}`
  return unit ? `${text} ${unit}` : text
}

// Accepts "150", "7,5" or "7.5" → canonical "7.5"; null if not a non-negative
// decimal with at most `scale` decimals.
export const parseQtyInput = (input: string, scale = 3): string | null => {
  const match = /^\s*(\d{1,11})(?:[.,](\d+))?\s*$/.exec(input)
  if (!match) return null
  const frac = (match[2] ?? '').replace(/0+$/, '')
  if (frac.length > scale) return null
  return `${match[1]}${frac ? `.${frac}` : ''}`
}
