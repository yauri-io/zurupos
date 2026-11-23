import { describe, expect, it } from 'vitest'
import { setupComplete, setupSteps, type SetupFacts } from '../app/utils/setup'

const fresh: SetupFacts = {
  hasContact: false,
  items: 0,
  ingredients: 0,
  users: 1,
  activeDevices: 0,
  hasOrder: false,
}

describe('setupSteps', () => {
  it('starts with nothing done for a new shop', () => {
    const steps = setupSteps(fresh)
    expect(steps.map((s) => s.key)).toEqual([
      'profile',
      'menu',
      'ingredients',
      'staff',
      'device',
      'first_order',
    ])
    expect(steps.every((s) => !s.done)).toBe(true)
    expect(setupComplete(steps)).toBe(false)
  })

  it('does not count the owner as added staff', () => {
    expect(setupSteps({ ...fresh, users: 1 }).find((s) => s.key === 'staff')?.done).toBe(false)
    expect(setupSteps({ ...fresh, users: 2 }).find((s) => s.key === 'staff')?.done).toBe(true)
  })

  it('is complete when the required steps are done, even with optional ones left', () => {
    const steps = setupSteps({ ...fresh, hasContact: true, items: 3, activeDevices: 1, hasOrder: true })
    expect(steps.filter((s) => !s.done).map((s) => s.key)).toEqual(['ingredients', 'staff'])
    expect(setupComplete(steps)).toBe(true)
  })

  it('stays open while a required step is missing', () => {
    expect(setupComplete(setupSteps({ ...fresh, hasContact: true, items: 3, hasOrder: true }))).toBe(false)
  })
})
