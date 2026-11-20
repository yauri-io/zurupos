// D-053: dashboard error reports never carry invite or reset tokens.
import type { ErrorEvent } from '@sentry/vue'
import { describe, expect, it } from 'vitest'
import { scrubBreadcrumb, scrubEvent, scrubUrl } from '../app/utils/sentry-scrub'

describe('scrubUrl', () => {
  it.each([
    ['https://app.zurupos.com/reset?token=abc123', 'https://app.zurupos.com/reset'],
    ['https://app.zurupos.com/invite/abc123', 'https://app.zurupos.com/invite/:token'],
    ['/invite/abc123?x=1#y', '/invite/:token'],
    ['https://app.zurupos.com/orders/42', 'https://app.zurupos.com/orders/42'],
    ['https://api.zurupos.com/v1/orders?from=2026-11-01', 'https://api.zurupos.com/v1/orders'],
  ])('%s', (input, expected) => {
    expect(scrubUrl(input)).toBe(expected)
  })
})

describe('scrubEvent', () => {
  it('keeps the user agent and nothing that can hold a token', () => {
    const event: ErrorEvent = {
      type: undefined,
      transaction: '/invite/abc123',
      request: {
        url: 'https://app.zurupos.com/invite/abc123',
        query_string: 'token=abc123',
        headers: { 'User-Agent': 'Chrome', Referer: 'https://app.zurupos.com/reset?token=abc123' },
      },
      breadcrumbs: [
        { category: 'navigation', data: { from: '/reset?token=abc123', to: '/invite/abc123' } },
        {
          category: 'fetch',
          data: { url: 'https://api.zurupos.com/v1/auth/reset?token=abc123', method: 'POST' },
        },
      ],
      user: { id: 'u1', email: 'owner@example.com', ip_address: '1.2.3.4' },
    }
    const out = scrubEvent(event)
    expect(JSON.stringify(out)).not.toContain('abc123')
    expect(out.request).toEqual({
      url: 'https://app.zurupos.com/invite/:token',
      headers: { 'User-Agent': 'Chrome' },
    })
    expect(out.user).toEqual({ id: 'u1' })
  })

  it('handles breadcrumbs without data', () => {
    expect(scrubBreadcrumb({ category: 'ui.click', message: 'button' })).toEqual({
      category: 'ui.click',
      message: 'button',
    })
  })
})
