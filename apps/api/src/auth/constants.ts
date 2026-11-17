export const SESSION_COOKIE = 'zuru_session'
export const DEVICE_TOKEN_HEADER = 'x-device-token'

const HOUR = 3_600_000
const MINUTE = 60_000

export const DASHBOARD_SESSION_TTL_MS = 30 * 24 * HOUR
// Sliding expiry is written at most this often (D-020).
export const DASHBOARD_SESSION_REFRESH_MS = HOUR
export const STAFF_SESSION_TTL_MS = 12 * HOUR

export const PIN_MAX_FAILURES = 5
export const PIN_LOCK_MS = 5 * MINUTE

export const PASSWORD_RESET_TTL_MS = HOUR
export const INVITE_TTL_MS = 72 * HOUR
