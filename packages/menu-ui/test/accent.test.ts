// D-082: accent.ts with pale yellow, pure white, black and mid grey (and a few
// brand colours): every result is readable.
import { describe, expect, it } from 'vitest'
import { accentColors, contrast, MIN_CONTRAST, parseHex, toHex } from '../src/accent'
import { TEMPLATE_TOKENS, TEMPLATES } from '../src/templates'

const CASES = {
  'pale yellow': '#fff9c4',
  'pure white': '#ffffff',
  black: '#000000',
  'mid grey': '#808080',
  'ZuruPOS default brown': '#6b4f3a',
  'brand orange': '#c8873a',
  'pure red': '#ff0000',
  'bright cyan': '#00ffff',
  'light pink': '#ffc0cb',
}

describe('contrast()', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })
  it('hex round-trips', () => {
    for (const hex of Object.values(CASES)) expect(toHex(parseHex(hex))).toBe(hex)
  })
})

describe('accentColors()', () => {
  for (const template of TEMPLATES) {
    const bg = TEMPLATE_TOKENS[template].bg
    it.each(Object.entries(CASES))(`${template}: %s → every result ≥ 4.5:1`, (_, accent) => {
      const c = accentColors(accent, bg)
      expect(c.accent).toBe(accent)
      expect(contrast(c.accent_text, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST)
      expect(contrast(c.on_accent, c.accent)).toBeGreaterThanOrEqual(MIN_CONTRAST)
      expect(['#ffffff', '#111111']).toContain(c.on_accent)
    })
  }

  it('picks white on dark and near-black on light accents', () => {
    expect(accentColors('#000000', '#ffffff').on_accent).toBe('#ffffff')
    expect(accentColors('#fff9c4', '#ffffff').on_accent).toBe('#111111')
    expect(accentColors('#808080', '#ffffff').on_accent).toBe('#111111')
  })

  it('keeps an accent that is already readable, and darkens one that is not', () => {
    expect(accentColors('#6b4f3a', '#fbfaf7').accent_text).toBe('#6b4f3a')
    const yellow = accentColors('#fff9c4', '#fbfaf7').accent_text
    expect(yellow).not.toBe('#fff9c4')
    // Still yellowish (red and green channels above blue), only darker.
    const [r, g, b] = parseHex(yellow)
    expect(r).toBeGreaterThan(b)
    expect(g).toBeGreaterThan(b)
  })

  it('darkens no further than needed (one step back is below 4.5:1)', () => {
    const bg = TEMPLATE_TOKENS.papan.bg
    const c = accentColors('#c8873a', bg)
    expect(contrast(c.accent_text, bg)).toBeLessThan(MIN_CONTRAST + 1)
  })

  it('rejects anything but #rrggbb', () => {
    expect(() => accentColors('red', '#ffffff')).toThrow()
    expect(() => accentColors('#fff', '#ffffff')).toThrow()
  })
})

describe('template tokens', () => {
  it.each(TEMPLATES)('%s: text and muted text are readable on the background and surface', (t) => {
    const k = TEMPLATE_TOKENS[t]
    for (const fg of [k.text, k.muted]) {
      expect(contrast(fg, k.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST)
      expect(contrast(fg, k.surface)).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
  })
})
