// Error reporting to Sentry (D-053). Off unless SENTRY_DSN is set, so local dev
// and tests send nothing. Errors only: no tracing, no profiling.
//
// Privacy: events never carry request bodies (PINs, passwords, customer names),
// cookies, query strings or auth headers, and no IP addresses. The scrubber below
// enforces that even if an integration attaches request data.
import * as Sentry from '@sentry/node'
import type { ErrorEvent } from '@sentry/node'
import type { SentryConfig } from '../config/env.js'

export type Service = 'api' | 'worker'

const SECRET_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-device-token'])

export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  const request = event.request
  if (request) {
    delete request.cookies
    delete request.data
    delete request.query_string
    if (request.url) request.url = request.url.split('?')[0]
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => !SECRET_HEADERS.has(name.toLowerCase())),
      )
    }
  }
  if (event.user) {
    delete event.user.ip_address
    delete event.user.email
    delete event.user.username
  }
  return event
}

// Returns whether Sentry was turned on.
export const initSentry = (config: SentryConfig, service: Service): boolean => {
  if (!config.dsn) return false
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    ...(config.release ? { release: config.release } : {}),
    // SDK 11 collects bodies, cookies and headers by default; turn all of it off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['user-agent', 'content-type', 'accept-language'] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    // The automatic Fastify integration would also report Postgres constraint
    // errors that the error handler turns into 400/404/409, and its copy would
    // win over ours (without request id or tenant). http/error-handler.ts is the
    // one place that decides what is a 500.
    integrations: (defaults) => defaults.filter((integration) => integration.name !== 'Fastify'),
    initialScope: { tags: { service } },
    beforeSend: scrubEvent,
  })
  return true
}

export type ErrorContext = {
  requestId?: string
  tenantId?: string
  method?: string
  route?: string
}

// Safe to call when Sentry is off: the SDK drops the event.
export const captureError = (err: unknown, context: ErrorContext = {}): void => {
  const tags = Object.fromEntries(
    Object.entries({
      request_id: context.requestId,
      tenant_id: context.tenantId,
      method: context.method,
      route: context.route,
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  Sentry.captureException(err, { tags })
}

export const captureMessage = (message: string, extra: Record<string, unknown>): void => {
  Sentry.captureMessage(message, { level: 'error', extra })
}

// Send queued events before the process exits.
export const closeSentry = async (timeoutMs = 2000): Promise<void> => {
  await Sentry.close(timeoutMs)
}
