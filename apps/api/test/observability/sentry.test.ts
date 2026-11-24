// D-053: Sentry is off without a DSN, and events never carry secrets or PII.
import type { ErrorEvent } from '@sentry/node'
import { describe, expect, it } from 'vitest'
import { loadSentry } from '../../src/config/env.js'
import { initSentry, scrubEvent } from '../../src/observability/sentry.js'

describe('Sentry config', () => {
  it('is off without SENTRY_DSN and falls back to NODE_ENV for the environment', () => {
    expect(loadSentry({}, 'production')).toEqual({
      dsn: undefined,
      environment: 'production',
      release: undefined,
    })
    expect(loadSentry({ SENTRY_DSN: '' }, 'test').dsn).toBeUndefined()
  })

  it('uses the build version as the release unless SENTRY_RELEASE is set', () => {
    expect(loadSentry({ ZURU_VERSION: '2026.11.24-debc0cb' }, 'production').release).toBe(
      '2026.11.24-debc0cb',
    )
    expect(
      loadSentry({ ZURU_VERSION: '2026.11.24-debc0cb', SENTRY_RELEASE: 'abc123' }, 'production').release,
    ).toBe('abc123')
  })

  it('reads the DSN, environment and release', () => {
    expect(
      loadSentry(
        {
          SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2',
          SENTRY_ENVIRONMENT: 'staging',
          SENTRY_RELEASE: 'abc123',
        },
        'production',
      ),
    ).toEqual({ dsn: 'https://k@o1.ingest.sentry.io/2', environment: 'staging', release: 'abc123' })
  })

  it('does not start without a DSN', () => {
    expect(initSentry({ dsn: undefined, environment: 'test', release: undefined }, 'api')).toBe(false)
  })
})

describe('scrubEvent', () => {
  it('drops bodies, cookies, query strings, auth headers and IPs', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        url: 'https://api.zurupos.com/v1/auth/pin-login?token=secret',
        method: 'POST',
        query_string: 'token=secret',
        cookies: { zuru_session: 'secret' },
        data: { pin: '123456' },
        headers: {
          Authorization: 'Bearer secret',
          cookie: 'zuru_session=secret',
          'x-device-token': 'secret',
          'user-agent': 'okhttp/4',
        },
      },
      user: { id: 'u1', ip_address: '1.2.3.4', email: 'owner@example.com', username: 'owner' },
    }
    const out = scrubEvent(event)
    expect(out.request).toEqual({
      url: 'https://api.zurupos.com/v1/auth/pin-login',
      method: 'POST',
      headers: { 'user-agent': 'okhttp/4' },
    })
    expect(out.user).toEqual({ id: 'u1' })
    expect(JSON.stringify(out)).not.toContain('secret')
  })

  it('leaves events without request or user data alone', () => {
    const event: ErrorEvent = { type: undefined, message: 'boom' }
    expect(scrubEvent(event)).toEqual({ type: undefined, message: 'boom' })
  })
})
