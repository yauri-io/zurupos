import type { AuthContext } from '../auth/context.js'
import { apiError } from './errors.js'

// Narrows request.auth on routes whose mode guarantees a user session.
export const requireAuth = (auth: AuthContext | null): AuthContext => {
  if (!auth) throw apiError('UNAUTHENTICATED')
  return auth
}
