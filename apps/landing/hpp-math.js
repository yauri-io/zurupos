// HPP calculator math (D-060). Pure functions, no DOM.
// Money is whole rupiah as BigInt; quantities are thousandths as BigInt; shares
// are basis points. No floating point anywhere (same rule as the product).

const QTY_SCALE = 1000n

// Round a non-negative fraction n/d half up.
const divHalfUp = (n, d) => (n * 2n + d) / (d * 2n)

// Ceiling of a non-negative fraction n/d.
const divCeil = (n, d) => (n + d - 1n) / d

// "Rp 150.000", "150.000", "150000" -> 150000n. A comma starts decimals, which
// rupiah prices don't use, so they're dropped. Empty or no digits -> null.
export const parseRupiah = (text) => {
  const whole = String(text ?? '').split(',')[0]
  const digits = whole.replace(/[^\d]/g, '')
  if (digits === '' || /[^\d.\sRrPp]/.test(whole.replace(/\d/g, ''))) return null
  return BigInt(digits)
}

// Quantity in thousandths: "18" -> 18000n, "0,5" -> 500n, "1.000" -> 1000000n,
// "0.25" -> 250n. With a comma, dots group thousands (Indonesian style). Without
// one, a dot is a thousands separator only in the form 1.000 or 12.500.000.
// More than 3 decimals, a negative or anything else -> null.
export const parseQty = (text) => {
  let s = String(text ?? '').trim()
  if (s === '') return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const m = /^(\d+)(?:\.(\d{1,3}))?$/.exec(s)
  if (!m) return null
  const frac = (m[2] ?? '').padEnd(3, '0')
  return BigInt(m[1]) * QTY_SCALE + BigInt(frac)
}

// Cost of one ingredient in one portion, in thousandths of a rupiah:
// price / packQty * useQty. Null when the pack size is zero.
export const ingredientCostMilli = (price, packQty, useQty) => {
  if (packQty <= 0n) return null
  return divHalfUp(price * useQty * 1000n, packQty)
}

// Sum the per-ingredient costs and round once, to whole rupiah.
export const totalRupiah = (costsMilli) =>
  divHalfUp(
    costsMilli.reduce((a, b) => a + b, 0n),
    1000n,
  )

export const milliToRupiah = (milli) => divHalfUp(milli, 1000n)

// part / whole in basis points, half up. Null when whole is zero.
export const shareBp = (part, whole) => {
  if (whole <= 0n) return null
  const negative = part < 0n
  const bp = divHalfUp((negative ? -part : part) * 10000n, whole)
  return negative ? -bp : bp
}

// "30" or "30,5" percent -> basis points (3000n, 3050n). Only 0 < p < 100.
export const parsePercentBp = (text) => {
  const q = parseQty(text) // thousandths of a percent
  if (q === null) return null
  const bp = q / 10n
  return bp > 0n && bp < 10000n && q % 10n === 0n ? bp : null
}

// Lowest price at which hpp is at most targetBp of it, rounded up to `step`.
export const suggestedPrice = (hpp, targetBp, step = 500n) => {
  if (hpp <= 0n || targetBp <= 0n) return null
  const raw = divCeil(hpp * 10000n, targetBp)
  return divCeil(raw, step) * step
}

// The page's one rupiah formatter: 1234567n -> "Rp 1.234.567".
export const formatRupiah = (amount) => {
  const negative = amount < 0n
  const digits = (negative ? -amount : amount).toString()
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '−' : ''}Rp ${grouped}`
}

// Basis points -> "37,3%" (one decimal, half up).
export const formatPercent = (bp) => {
  const negative = bp < 0n
  const tenths = divHalfUp(negative ? -bp : bp, 10n)
  const text = `${tenths / 10n},${tenths % 10n}%`
  return negative ? `−${text}` : text
}

// Thousandths -> "0,5", "18", "1.000" for display.
export const formatQty = (qty) => {
  const whole = (qty / QTY_SCALE).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const frac = (qty % QTY_SCALE).toString().padStart(3, '0').replace(/0+$/, '')
  return frac ? `${whole},${frac}` : whole
}

// Everything the page shows, from the raw text of the form.
// ingredients: [{ price, pack, use }] as typed. Returns per-row costs (null when
// a row isn't valid yet) and the totals, or nulls where they can't be known.
export const calculate = ({ ingredients, sellPrice, targetPercent }) => {
  const rows = ingredients.map((r) => {
    const price = parseRupiah(r.price)
    const pack = parseQty(r.pack)
    const use = parseQty(r.use)
    const errors = {
      price: price === null,
      pack: pack === null || pack === 0n,
      use: use === null,
    }
    const milli = errors.price || errors.pack || errors.use ? null : ingredientCostMilli(price, pack, use)
    return { milli, errors }
  })
  const complete = rows.length > 0 && rows.every((r) => r.milli !== null)
  const hpp = complete ? totalRupiah(rows.map((r) => r.milli)) : null
  const sell = parseRupiah(sellPrice)
  const targetBp = parsePercentBp(targetPercent)
  const sellOk = sell !== null && sell > 0n
  return {
    rows: rows.map((r) => ({ ...r, cost: r.milli === null ? null : milliToRupiah(r.milli) })),
    hpp,
    sell: sellOk ? sell : null,
    hppBp: hpp !== null && sellOk ? shareBp(hpp, sell) : null,
    profit: hpp !== null && sellOk ? sell - hpp : null,
    targetBp,
    suggested: hpp !== null && targetBp !== null ? suggestedPrice(hpp, targetBp) : null,
  }
}
