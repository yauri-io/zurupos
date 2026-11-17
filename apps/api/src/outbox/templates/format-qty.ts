import { divHalfUp } from '../../domain/decimal.js'

// Stock for humans (SPEC §8): "1,5 kg" from 1500 g, "750 ml", "12 pcs", with the
// locale's separators. `qty` is in thousandths of the base unit. 1 kg / 1 L and up
// are shown with at most 2 decimals, rounded half-up; smaller values exactly.
export const formatStock = (qty: bigint, baseUnit: string, locale: 'id' | 'en'): string => {
  const abs = qty < 0n ? -qty : qty
  const big = (baseUnit === 'g' || baseUnit === 'ml') && abs >= 1_000_000n
  const [scaled, digits] = big ? [divHalfUp(abs, 10_000n), 2] : [abs, 3]
  const unit = 10n ** BigInt(digits)
  const whole = (scaled / unit).toString()
  const frac = (scaled % unit).toString().padStart(digits, '0').replace(/0+$/, '')
  const [thousands, decimal] = locale === 'id' ? ['.', ','] : [',', '.']
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands)
  const unitName = big ? (baseUnit === 'g' ? 'kg' : 'L') : baseUnit
  return `${qty < 0n ? '-' : ''}${grouped}${frac ? `${decimal}${frac}` : ''} ${unitName}`
}
