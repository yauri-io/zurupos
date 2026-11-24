import { describe, expect, it } from 'vitest'
import { isNewBuild } from '../app/utils/version'

describe('isNewBuild', () => {
  it('is true when the server runs another build', () => {
    expect(isNewBuild('2026.11.24-debc0cb', '2026.11.25-0a1b2c3')).toBe(true)
  })
  it('is false for the same build', () => {
    expect(isNewBuild('2026.11.24-debc0cb', '2026.11.24-debc0cb')).toBe(false)
  })
  it('ignores a missing or malformed answer', () => {
    expect(isNewBuild('2026.11.24-debc0cb', undefined)).toBe(false)
    expect(isNewBuild('2026.11.24-debc0cb', '')).toBe(false)
    expect(isNewBuild('2026.11.24-debc0cb', 42)).toBe(false)
  })
})
