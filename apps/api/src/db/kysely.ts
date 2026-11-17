import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { DB } from './types.js'

// Postgres `bigint` (int8) is parsed as JS BigInt so money never passes through a float.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => BigInt(value))
// `date` columns (business dates) stay 'YYYY-MM-DD' strings; never shifted through a JS Date.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value)

export type Database = Kysely<DB>

export const createDb = (connectionString: string, max: number): Database =>
  new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max }) }),
  })
