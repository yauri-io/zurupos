// The dashboard is a cross-origin SPA: every method its routes use must pass the
// CORS preflight, and only for the configured dashboard origin.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from './support/app.js'

let t: TestApp
beforeAll(async () => {
  t = await createTestApp()
})
afterAll(() => t.close())

const preflight = (method: string, origin = 'http://localhost:3000') =>
  t.app.inject({
    method: 'OPTIONS',
    url: '/v1/items/00000000-0000-4000-8000-000000000000',
    headers: {
      origin,
      'access-control-request-method': method,
      'access-control-request-headers': 'content-type,x-requested-with,accept-language',
    },
  })

describe('CORS preflight', () => {
  it('allows every method the API uses, with credentials, for the dashboard origin', async () => {
    const used = new Set(
      Object.values((t.app.swagger() as { paths: Record<string, object> }).paths).flatMap((ops) =>
        Object.keys(ops).map((m) => m.toUpperCase()),
      ),
    )
    for (const method of used) {
      const res = await preflight(method)
      expect(res.statusCode, method).toBe(204)
      expect(
        String(res.headers['access-control-allow-methods'])
          .split(',')
          .map((m) => m.trim()),
        method,
      ).toContain(method)
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000')
      expect(res.headers['access-control-allow-credentials']).toBe('true')
    }
  })

  it('never echoes another origin (the browser then blocks the request)', async () => {
    const res = await preflight('PUT', 'https://evil.example')
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example')
  })
})
