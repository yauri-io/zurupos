import type { Database } from '../db/kysely.js'
import { apiError } from '../http/errors.js'
import { findLoginByEmail, type LoginLookup } from './lookups.js'
import { burnVerify, verifySecret } from './secrets.js'

// Email + password check for owners/managers (dashboard login, device pairing).
// Every failure is the same generic UNAUTHENTICATED (SPEC §5.1).
export const verifyCredentials = async (
  db: Database,
  email: string,
  password: string,
): Promise<LoginLookup> => {
  const login = await findLoginByEmail(db, email)
  if (!login?.password_hash || !login.is_active) {
    await burnVerify(password)
    throw apiError('UNAUTHENTICATED')
  }
  if (!(await verifySecret(login.password_hash, password))) throw apiError('UNAUTHENTICATED')
  return login
}
