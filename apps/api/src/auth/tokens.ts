import { createHash, randomBytes } from 'node:crypto'

// Opaque bearer tokens: 32 random bytes, sent as base64url. The DB stores only
// the SHA-256 hash (SPEC §5.1, §5.2).
export const hashToken = (token: string): Buffer => createHash('sha256').update(token, 'utf8').digest()

export const generateToken = (): { token: string; hash: Buffer } => {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/

export const looksLikeToken = (value: unknown): value is string =>
  typeof value === 'string' && TOKEN_SHAPE.test(value)
