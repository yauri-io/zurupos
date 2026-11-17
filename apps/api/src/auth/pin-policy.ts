// PIN rules (SPEC §5.3): 4–6 digits, trivially weak PINs rejected.

const isRepeated = (pin: string) => /^(\d)\1+$/.test(pin)

// PINs are validated as ASCII digits before this runs.
const isRun = (pin: string, step: 1 | -1) =>
  Array.from({ length: pin.length }, (_, i) => Number(pin[i])).every(
    (d, i, digits) => i === 0 || d === ((digits[i - 1] ?? 0) + step + 10) % 10,
  )

const KNOWN_WEAK = new Set(['1212', '6969', '1004', '2000', '121212', '112233', '123123', '123321', '696969'])

export type PinProblem = 'format' | 'weak'

export const checkPin = (pin: string): PinProblem | null => {
  if (!/^\d{4,6}$/.test(pin)) return 'format'
  if (isRepeated(pin) || isRun(pin, 1) || isRun(pin, -1) || KNOWN_WEAK.has(pin)) return 'weak'
  return null
}
