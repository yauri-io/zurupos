// Any brand colour, readable text (D-082, SPEC §12.7). Pure functions.
//   on_accent:   #ffffff or #111111, whichever contrasts more with the accent
//                (text on accent-coloured buttons and badges);
//   accent_text: the accent darkened in OKLCH lightness steps of 0.02 until it
//                has at least 4.5:1 against the template background (accent
//                used as text or links on the page).

export type AccentColors = { accent: string; on_accent: string; accent_text: string }

type Rgb = [r: number, g: number, b: number] // 0..1, sRGB

const HEX = /^#([0-9a-f]{6})$/i
export const MIN_CONTRAST = 4.5
const WHITE = '#ffffff'
const NEAR_BLACK = '#111111'
const STEP = 0.02

export const parseHex = (hex: string): Rgb => {
  const m = HEX.exec(hex)
  if (!m?.[1]) throw new Error(`not a #rrggbb colour: ${hex}`)
  const n = Number.parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export const toHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

// WCAG 2 relative luminance and contrast ratio.
export const luminance = (hex: string): number => {
  const [r, g, b] = parseHex(hex).map(toLinear) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

// sRGB ↔ OKLCH (Björn Ottosson's OKLab).
type Oklch = { l: number; c: number; h: number }

const toOklch = (hex: string): Oklch => {
  const [r, g, b] = parseHex(hex).map(toLinear) as Rgb
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) }
}

const fromOklch = ({ l: L, c, h }: Oklch): string => {
  const A = c * Math.cos(h)
  const B = c * Math.sin(h)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const rgb: Rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  // Out-of-gamut channels are clipped; lightness keeps falling, so the loop ends.
  return toHex(rgb.map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as Rgb)
}

export const accentColors = (accent: string, background: string): AccentColors => {
  const base = toHex(parseHex(accent))
  const onAccent = contrast(WHITE, base) >= contrast(NEAR_BLACK, base) ? WHITE : NEAR_BLACK
  let text = base
  if (contrast(text, background) < MIN_CONTRAST) {
    const lch = toOklch(base)
    for (let l = lch.l - STEP; ; l -= STEP) {
      text = l <= 0 ? '#000000' : fromOklch({ ...lch, l })
      if (l <= 0 || contrast(text, background) >= MIN_CONTRAST) break
    }
  }
  return { accent: base, on_accent: onAccent, accent_text: text }
}
