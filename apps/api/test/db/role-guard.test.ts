import { afterAll, describe, expect, it } from 'vitest'
import { createDb, type Database } from '../../src/db/kysely.js'
import { assertSafeDbRole, fetchRoleFacts, roleViolations, type RoleFacts } from '../../src/db/role-guard.js'

const env = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const dbs: Database[] = []
const connect = (url: string): Database => {
  const db = createDb(url, 1)
  dbs.push(db)
  return db
}
afterAll(() => Promise.all(dbs.map((db) => db.destroy())))

// Superuser on the test database, built from the local-only container password.
const superuserUrl = (): string => {
  const url = new URL(env('TEST_DATABASE_URL'))
  url.username = 'postgres'
  url.password = env('POSTGRES_PASSWORD')
  return url.toString()
}

const safe: RoleFacts = {
  role: 'zuru_app',
  superuser: false,
  bypassRls: false,
  ownerMember: false,
  ownedTables: [],
}

describe('roleViolations', () => {
  it('accepts a plain RLS-bound role', () => {
    expect(roleViolations(safe)).toEqual([])
  })

  it.each([
    [{ superuser: true }, 'is a superuser'],
    [{ bypassRls: true }, 'has BYPASSRLS'],
    [{ ownerMember: true }, 'is a member of zuru_owner'],
    [{ ownedTables: ['public.users'] }, 'owns tables: public.users'],
  ])('rejects %o', (override, message) => {
    expect(roleViolations({ ...safe, ...override })).toEqual([message])
  })
})

describe('assertSafeDbRole against the real database', () => {
  it('lets zuru_app start', async () => {
    const db = connect(env('TEST_DATABASE_URL'))
    expect(await fetchRoleFacts(db)).toEqual(safe)
    await expect(assertSafeDbRole(db)).resolves.toBeUndefined()
  })

  it('lets zuru_worker start', async () => {
    await expect(assertSafeDbRole(connect(env('TEST_WORKER_DATABASE_URL')))).resolves.toBeUndefined()
  })

  it('refuses the migrator (runs as zuru_owner, owns every table)', async () => {
    const db = connect(env('TEST_MIGRATION_DATABASE_URL').replace('?sslmode=disable', ''))
    const facts = await fetchRoleFacts(db)
    expect(facts).toMatchObject({ role: 'zuru_owner', ownerMember: true })
    expect(facts.ownedTables).toContain('public.users')
    await expect(assertSafeDbRole(db)).rejects.toThrow(/Refusing to start.*member of zuru_owner.*owns tables/)
  })

  it('refuses a superuser', async () => {
    const db = connect(superuserUrl())
    await expect(assertSafeDbRole(db)).rejects.toThrow(
      /Refusing to start: database role "postgres" is a superuser/,
    )
  })
})
