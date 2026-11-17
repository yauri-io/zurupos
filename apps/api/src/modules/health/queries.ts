import { sql } from 'kysely'
import type { Database } from '../../db/kysely.js'

export const pingDb = async (db: Database): Promise<boolean> => {
  const result = await sql<{ ok: number }>`select 1 as ok`.execute(db)
  return result.rows[0]?.ok === 1
}
