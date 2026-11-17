import { sql, type RawBuilder } from 'kysely'
import { apiError } from './errors.js'

// Opaque keyset cursor over (created_at desc, id desc) for history lists (SPEC §9).
// The timestamp is kept as Postgres renders it, with microseconds: a JS Date only
// holds milliseconds and would skip or repeat rows that share a millisecond.
export type Cursor = { createdAt: string; id: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UTC_MICROS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/

// Select expression for a cursor-precise created_at.
export const cursorTimestamp = (column: string): RawBuilder<string> =>
  sql<string>`to_char(${sql.ref(column)} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

export const encodeCursor = (c: Cursor): string =>
  Buffer.from(`${c.createdAt}|${c.id}`, 'utf8').toString('base64url')

export const decodeCursor = (value: string | undefined): Cursor | null => {
  if (value === undefined || value === '') return null
  const [createdAt, id] = Buffer.from(value, 'base64url').toString('utf8').split('|')
  if (!id || !UUID.test(id) || !createdAt || !UTC_MICROS.test(createdAt)) {
    throw apiError('VALIDATION', { field: 'cursor', problem: 'invalid' })
  }
  return { createdAt, id }
}

export const DEFAULT_PAGE = 50

export const pageLimit = (limit: string | undefined): number => (limit === undefined ? DEFAULT_PAGE : Number(limit))
