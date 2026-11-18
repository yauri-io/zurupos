import pg from 'pg'
import '../../src/db/kysely.js' // registers the int8/date type parsers

const testDatabaseUrl = (): string => {
  const url = process.env['TEST_DATABASE_URL']
  if (!url) throw new Error('TEST_DATABASE_URL is not set')
  return url
}

// Always zuru_app: the isolation suite must run as the API's runtime role.
export const appPool = (max = 4): pg.Pool => new pg.Pool({ connectionString: testDatabaseUrl(), max })

export const workerPool = (max = 2): pg.Pool => {
  const url = process.env['TEST_WORKER_DATABASE_URL']
  if (!url) throw new Error('TEST_WORKER_DATABASE_URL is not set')
  return new pg.Pool({ connectionString: url, max })
}

// Tests don't restart Postgres; test/db/reconnect.test.ts covers the handler.
export const ignoreIdleError = (): void => {}

export type Row = Record<string, unknown>

// Runs fn in a transaction with app.tenant_id set LOCAL (SPEC §3.3). null = no context.
export const inTx = async <T>(
  pool: pg.Pool,
  tenantId: string | null,
  fn: (c: pg.PoolClient) => Promise<T>,
) => {
  const client = await pool.connect()
  try {
    await client.query('begin')
    if (tenantId !== null) await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId])
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}

export const insertRow = async (client: pg.ClientBase, table: string, row: Row): Promise<pg.QueryResult> => {
  const cols = Object.keys(row)
  const params = cols.map((_, i) => `$${i + 1}`)
  return client.query(
    `insert into ${table} (${cols.join(', ')}) values (${params.join(', ')})`,
    cols.map((c) => row[c]),
  )
}

// Captures the SQLSTATE of a failing statement inside a savepoint so the
// surrounding transaction stays usable.
export const sqlStateOf = async (
  client: pg.ClientBase,
  run: () => Promise<unknown>,
): Promise<string | null> => {
  await client.query('savepoint probe')
  try {
    await run()
    await client.query('release savepoint probe')
    return null
  } catch (err) {
    await client.query('rollback to savepoint probe')
    return (err as { code?: string }).code ?? 'unknown'
  }
}

export const RLS_VIOLATION = '42501'
