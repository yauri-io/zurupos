// New-shop setup checklist on Home (D-056). Each step is ticked from the
// shop's real data, never from a flag, so it can't drift out of date.

export type SetupStepKey = 'profile' | 'menu' | 'ingredients' | 'staff' | 'device' | 'first_order'

export type SetupStep = { key: SetupStepKey; done: boolean; optional: boolean; to: string }

export type SetupFacts = {
  hasContact: boolean // address or phone filled in Settings (printed on the receipt)
  items: number
  ingredients: number
  users: number // includes the owner
  activeDevices: number
  hasOrder: boolean
}

export const setupSteps = (f: SetupFacts): SetupStep[] => [
  { key: 'profile', done: f.hasContact, optional: false, to: '/settings' },
  { key: 'menu', done: f.items > 0, optional: false, to: '/menu' },
  { key: 'ingredients', done: f.ingredients > 0, optional: true, to: '/ingredients' },
  { key: 'staff', done: f.users > 1, optional: true, to: '/users' },
  { key: 'device', done: f.activeDevices > 0, optional: false, to: '/devices' },
  { key: 'first_order', done: f.hasOrder, optional: false, to: '/orders' },
]

// The checklist disappears once every required step is done.
export const setupComplete = (steps: SetupStep[]): boolean => steps.every((s) => s.optional || s.done)
