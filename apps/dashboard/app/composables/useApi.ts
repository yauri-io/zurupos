import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from '@zurupos/api-client'

export type ApiErrorBody = { error: { code: string; message: string; details?: Record<string, unknown> } }

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

let client: ReturnType<typeof createClient<paths>> | null = null

// One typed client for the whole dashboard. The session is an HttpOnly cookie;
// every request carries the CSRF header the API requires (SPEC §5.1).
export const useApi = () => {
  if (client) return client
  const config = useRuntimeConfig()
  const { locale } = useNuxtApp().$i18n
  client = createClient<paths>({
    baseUrl: config.public.apiBase,
    credentials: 'include',
    headers: { 'X-Requested-With': 'zuru' },
  })
  const language: Middleware = {
    onRequest({ request }) {
      request.headers.set('Accept-Language', locale.value)
      return request
    },
  }
  client.use(language)
  return client
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' && value !== null && 'error' in value

// Unwraps an openapi-fetch result: returns data or throws ApiFailure.
export const unwrap = async <T>(
  pending: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> => {
  const { data, error, response } = await pending
  if (response.ok) return data as T
  if (isErrorBody(error)) {
    throw new ApiFailure(response.status, error.error.code, error.error.message, error.error.details)
  }
  throw new ApiFailure(response.status, 'INTERNAL', response.statusText)
}
