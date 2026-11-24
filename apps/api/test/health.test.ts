import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { createDb } from '../src/db/kysely.js'
import type { App } from '../src/http/types.js'
import { testConfig } from './helpers.js'
import { ignoreIdleError } from './support/pg.js'

describe('GET /healthz', () => {
  const config = testConfig()
  const db = createDb(config.databaseUrl, 2, ignoreIdleError)
  let app: App

  beforeAll(async () => {
    app = await buildApp({ config, db })
  })
  afterAll(async () => {
    await app.close()
    await db.destroy()
  })

  it('pings the database and reports the build version', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok', db: 'ok', version: config.version })
    expect(res.headers['x-request-id']).toBeTruthy()
  })

  it('returns the SPEC §9 error shape for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope', headers: { 'accept-language': 'en' } })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.', details: {} } })
  })
})
