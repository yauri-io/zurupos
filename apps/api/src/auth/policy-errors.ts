import { apiError } from '../http/errors.js'
import { checkPassword } from './password-policy.js'
import { checkPin } from './pin-policy.js'

export const assertPinAllowed = (pin: string, field = 'pin') => {
  const problem = checkPin(pin)
  if (problem) throw apiError('VALIDATION', { field, problem })
}

export const assertPasswordAllowed = (password: string, field = 'password') => {
  const problem = checkPassword(password)
  if (problem) throw apiError('VALIDATION', { field, problem })
}
