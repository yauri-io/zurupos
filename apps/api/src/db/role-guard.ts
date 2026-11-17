import { sql } from 'kysely'
import type { Database } from './kysely.js'

// Boot-time check that the API is connected as a role RLS actually applies to
// (SPEC §3.1, D-024). Superusers, BYPASSRLS roles, zuru_owner members and table
// owners all see every tenant's rows, so the process must refuse to start.

export type RoleFacts = {
  role: string
  superuser: boolean
  bypassRls: boolean
  ownerMember: boolean
  ownedTables: string[]
}

export const roleViolations = (facts: RoleFacts): string[] => [
  ...(facts.superuser ? ['is a superuser'] : []),
  ...(facts.bypassRls ? ['has BYPASSRLS'] : []),
  ...(facts.ownerMember ? ['is a member of zuru_owner'] : []),
  ...(facts.ownedTables.length > 0 ? [`owns tables: ${facts.ownedTables.join(', ')}`] : []),
]

export const fetchRoleFacts = async (db: Database): Promise<RoleFacts> => {
  const { rows } = await sql<{
    role: string
    superuser: boolean
    bypass_rls: boolean
    owner_member: boolean | null
    owned_tables: string[]
  }>`
    select r.rolname as role, r.rolsuper as superuser, r.rolbypassrls as bypass_rls,
           (select pg_has_role(r.oid, o.oid, 'MEMBER') from pg_roles o where o.rolname = 'zuru_owner')
             as owner_member,
           array(
             select n.nspname || '.' || c.relname
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname in ('public', 'auth') and c.relowner = r.oid
               and c.relkind in ('r', 'p', 'v', 'm', 'f')
             order by 1
           ) as owned_tables
    from pg_roles r where r.rolname = current_user`.execute(db)
  const row = rows[0]
  if (!row) throw new Error('role guard: current_user not found in pg_roles')
  return {
    role: row.role,
    superuser: row.superuser,
    bypassRls: row.bypass_rls,
    // Missing zuru_owner means the database was not bootstrapped per D-014: fail closed.
    ownerMember: row.owner_member ?? true,
    ownedTables: row.owned_tables,
  }
}

export const assertSafeDbRole = async (db: Database): Promise<void> => {
  const facts = await fetchRoleFacts(db)
  const violations = roleViolations(facts)
  if (violations.length > 0) {
    throw new Error(`Refusing to start: database role "${facts.role}" ${violations.join('; ')} (SPEC §3.1)`)
  }
}
