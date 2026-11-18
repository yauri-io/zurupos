// A Postgres restart closes idle pooled connections. The pool must log that and
// reconnect, not crash the process (the worker died this way during UAT).
import { sql } from 'kysely'
import pg from 'pg'
import { expect, it, vi } from 'vitest'
import { createDb } from '../../src/db/kysely.js'

const url = process.env['TEST_DATABASE_URL'] ?? ''

it('a server-closed idle connection is reported and replaced, not fatal', async () => {
  const errors: Error[] = []
  const db = createDb(url, 1, (err) => {
    errors.push(err)
  })
  try {
    const pidOf = async () =>
      (await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(db)).rows[0]?.pid
    const before = await pidOf()

    // Same role (zuru_app), so no superuser needed to end that backend.
    const killer = new pg.Client({ connectionString: url })
    await killer.connect()
    try {
      await killer.query('select pg_terminate_backend($1)', [before])
    } finally {
      await killer.end()
    }

    await vi.waitFor(() => {
      expect(errors).toHaveLength(1)
    })
    const after = await pidOf()
    expect(after).toBeDefined()
    expect(after).not.toBe(before)
  } finally {
    await db.destroy()
  }
})
