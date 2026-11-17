// Password rules (SPEC §5.1): at least 8 characters and not a common password.

const COMMON = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password123',
  'qwerty123',
  'qwertyuiop',
  '11111111',
  '00000000',
  '87654321',
  'iloveyou',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'welcome1',
  'admin123',
  'abcd1234',
  'abc12345',
  'letmein1',
  'passw0rd',
  'superman',
  'trustno1',
  'indonesia',
  'jakarta1',
  'bismillah',
  'sayang123',
  'rahasia1',
  'katasandi',
  'kopikopi',
  'zurupos1',
])

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128

export type PasswordProblem = 'too_short' | 'too_long' | 'common'

export const checkPassword = (password: string): PasswordProblem | null => {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too_short'
  if (password.length > MAX_PASSWORD_LENGTH) return 'too_long'
  if (COMMON.has(password.toLowerCase())) return 'common'
  return null
}
