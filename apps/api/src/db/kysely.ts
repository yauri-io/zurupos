import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { DB } from './types.js'

// Postgres `bigint` (int8) is parsed as JS BigInt so money never passes through a float.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => BigInt(value))
// `date` columns (business dates) stay 'YYYY-MM-DD' strings; never shifted through a JS Date.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value)

export type Database = Kysely<DB>

// An idle pooled connection can be closed by the server (restart, failover).
// pg emits that as an 'error' event on the pool; unhandled, it kills the process.
// Handled, the pool drops that client and opens a new one on the next query.
// pg attaches the whole client to the error; log only what helps.
export const idleErrorFields = (err: Error) => ({
  code: (err as Error & { code?: string }).code,
  message: err.message,
})

export const createDb = (
  connectionString: string,
  max: number,
  onIdleError: (err: Error) => void,
): Database => {
  const pool = new pg.Pool({ connectionString, max })
  pool.on('error', onIdleError)
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) })
}
