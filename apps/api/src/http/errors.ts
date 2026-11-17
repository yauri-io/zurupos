// API error format (SPEC §9): { error: { code, message, details } }.

export const ERROR_STATUS = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PIN_LOCKED: 423,
  PAYMENT_MISMATCH: 422,
  PRICE_CHANGED: 409,
  ITEM_UNAVAILABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const

export type ErrorCode = keyof typeof ERROR_STATUS

export type ApiError = Error & {
  readonly isApiError: true
  readonly code: ErrorCode
  readonly statusCode: number
  readonly details: Record<string, unknown>
}

export const apiError = (code: ErrorCode, details: Record<string, unknown> = {}): ApiError =>
  Object.assign(new Error(code), {
    isApiError: true as const,
    code,
    statusCode: ERROR_STATUS[code],
    details,
  })

export const isApiError = (err: unknown): err is ApiError =>
  err instanceof Error && (err as Partial<ApiError>).isApiError === true
