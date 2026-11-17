// SPEC §3.6 #3, #4, #5 — catalog-level guarantees that hold for every table.
import { afterAll, describe, expect, it } from 'vitest'
import { DELETABLE_TABLES, TENANT_TABLES } from '../support/factories.js'
import { appPool, workerPool } from '../support/pg.js'

const pool = appPool(2)
afterAll(() => pool.end())

const SYSTEM_TABLES = ['outbox', 'schema_migrations']
const AUTH_LOOKUP_TABLES = ['devices', 'password_resets', 'sessions', 'users']
const DEFINER_FUNCTIONS = [
  'auth.find_device',
  'auth.find_login_by_email',
  'auth.find_password_reset',
  'auth.find_session',
]

const publicTables = async () => {
  const { rows } = await pool.query<{ name: string; rls: boolean; force: boolean; owner: string }>(`
    select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force,
           pg_get_userbyid(c.relowner) as owner
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    order by c.relname`)
  return rows
}

describe('§3.6 #3 — every table has RLS enabled and forced', () => {
  it('all public tables except the system allowlist', async () => {
    const offenders = (await publicTables())
      .filter((t) => !SYSTEM_TABLES.includes(t.name))
      .filter((t) => !t.rls || !t.force)
      .map((t) => t.name)
    expect(offenders).toEqual([])
  })

  it('the isolation suite has a factory for every RLS table (new tables cannot skip it)', async () => {
    const rlsTables = (await publicTables()).filter((t) => t.rls).map((t) => t.name)
    expect([...rlsTables].sort()).toEqual([...TENANT_TABLES].sort())
  })

  it('every tenant table has exactly the tenant_isolation policy for all commands and roles', async () => {
    const { rows } = await pool.query<{
      table: string
      qual: string
      check: string
      cmd: string
      roles: string[]
    }>(`
      select tablename as table, qual, with_check as check, cmd, roles::text[] as roles
      from pg_policies where schemaname = 'public' and policyname = 'tenant_isolation'`)
    const byTable = new Map(rows.map((r) => [r.table, r]))
    for (const table of TENANT_TABLES) {
      const p = byTable.get(table)
      const col = table === 'tenants' ? 'id' : 'tenant_id'
      const expected = `(${col} = ( SELECT app_current_tenant() AS app_current_tenant))`
      expect(p, table).toBeDefined()
      expect({ cmd: p?.cmd, roles: p?.roles, qual: p?.qual, check: p?.check }, table).toEqual({
        cmd: 'ALL',
        roles: ['public'],
        qual: expected,
        check: expected,
      })
    }
  })

  it('the only other policies are the D-024 SELECT-only lookups for zuru_owner', async () => {
    const { rows } = await pool.query<{
      table: string
      name: string
      cmd: string
      roles: string[]
      permissive: string
    }>(`
      select tablename as table, policyname as name, cmd, roles::text[] as roles, permissive
      from pg_policies where schemaname = 'public' and policyname <> 'tenant_isolation'
      order by tablename`)
    expect(rows).toEqual(
      AUTH_LOOKUP_TABLES.map((table) => ({
        table,
        name: 'auth_definer_lookup',
        cmd: 'SELECT',
        roles: ['zuru_owner'],
        permissive: 'PERMISSIVE',
      })),
    )
  })

  it('every view is security_invoker', async () => {
    const { rows } = await pool.query<{ name: string }>(`
      select c.relname as name from pg_class c
      where c.relkind = 'v' and c.relnamespace in ('public'::regnamespace)
        and not coalesce('security_invoker=true' = any (c.reloptions), false)`)
    expect(rows).toEqual([])
  })
})

describe('§3.6 #4 — zuru_app cannot bypass RLS', () => {
  it('is not superuser, has no BYPASSRLS, cannot create roles or databases', async () => {
    const { rows } = await pool.query(`
      select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin
      from pg_roles where rolname = 'zuru_app'`)
    expect(rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolcanlogin: true,
    })
  })

  it('owns no tables, schemas or functions', async () => {
    const { rows } = await pool.query<{ n: bigint }>(`
      select (select count(*) from pg_class where relowner = 'zuru_app'::regrole)
           + (select count(*) from pg_namespace where nspowner = 'zuru_app'::regrole)
           + (select count(*) from pg_proc where proowner = 'zuru_app'::regrole) as n`)
    expect(rows[0]?.n).toBe(0n)
  })

  it('is not a member of zuru_owner or any other role', async () => {
    const { rows } = await pool.query<{ owner: boolean; memberships: bigint }>(`
      select pg_has_role('zuru_app', 'zuru_owner', 'MEMBER') as owner,
             (select count(*) from pg_auth_members where member = 'zuru_app'::regrole) as memberships`)
    expect(rows[0]).toEqual({ owner: false, memberships: 0n })
  })

  it('zuru_app and zuru_worker cannot CREATE in schemas public or auth', async () => {
    const { rows } = await pool.query<{ role: string; schema: string; create: boolean }>(`
      select r.role, s.schema, has_schema_privilege(r.role, s.schema, 'CREATE') as create
      from (values ('zuru_app'), ('zuru_worker')) r(role),
           (values ('auth'), ('public')) s(schema)
      order by 1, 2`)
    expect(rows).toEqual([
      { role: 'zuru_app', schema: 'auth', create: false },
      { role: 'zuru_app', schema: 'public', create: false },
      { role: 'zuru_worker', schema: 'auth', create: false },
      { role: 'zuru_worker', schema: 'public', create: false },
    ])
  })

  it('every table is owned by zuru_owner', async () => {
    const owners = new Set((await publicTables()).map((t) => t.owner))
    expect([...owners]).toEqual(['zuru_owner'])
  })

  it('has exactly the D-015 table privileges', async () => {
    const { rows } = await pool.query<{
      table: string
      sel: boolean
      ins: boolean
      upd: boolean
      del: boolean
      trunc: boolean
    }>(`
      select c.relname as table,
             has_table_privilege('zuru_app', c.oid, 'SELECT') as sel,
             has_table_privilege('zuru_app', c.oid, 'INSERT') as ins,
             has_table_privilege('zuru_app', c.oid, 'UPDATE') as upd,
             has_table_privilege('zuru_app', c.oid, 'DELETE') as del,
             has_table_privilege('zuru_app', c.oid, 'TRUNCATE') as trunc
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'`)
    const privileges = Object.fromEntries(rows.map((r) => [r.table, r]))
    for (const table of TENANT_TABLES) {
      const appendOnly = table === 'stock_movements' || table === 'audit_log'
      expect(privileges[table], table).toEqual({
        table,
        sel: true,
        ins: true,
        upd: !appendOnly,
        del: DELETABLE_TABLES.includes(table),
        trunc: false,
      })
    }
    expect(privileges['outbox']).toEqual({
      table: 'outbox',
      sel: false,
      ins: true,
      upd: false,
      del: false,
      trunc: false,
    })
    expect(privileges['schema_migrations']).toMatchObject({ sel: false, ins: false, upd: false, del: false })
  })

  it('zuru_worker can only read and update the outbox', async () => {
    const worker = workerPool(1)
    try {
      const { rows } = await worker.query<{ table: string; sel: boolean; upd: boolean; ins: boolean }>(`
        select c.relname as table,
               has_table_privilege(c.oid, 'SELECT') as sel,
               has_table_privilege(c.oid, 'UPDATE') as upd,
               has_table_privilege(c.oid, 'INSERT') as ins
        from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
          and (has_table_privilege(c.oid, 'SELECT') or has_table_privilege(c.oid, 'UPDATE')
               or has_table_privilege(c.oid, 'INSERT') or has_table_privilege(c.oid, 'DELETE'))`)
      expect(rows).toEqual([{ table: 'outbox', sel: true, upd: true, ins: false }])
      const roles = await worker.query(
        `select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
      )
      expect(roles.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
    } finally {
      await worker.end()
    }
  })
})

describe('§3.6 #5 — SECURITY DEFINER functions are exactly the four in §3.4', () => {
  it('lists only auth.find_* functions', async () => {
    const { rows } = await pool.query<{ fn: string }>(`
      select n.nspname || '.' || p.proname as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
      order by 1`)
    expect(rows.map((r) => r.fn)).toEqual(DEFINER_FUNCTIONS)
  })

  it('each pins search_path (pg_temp last), is owned by zuru_owner and is executable only by zuru_app', async () => {
    const { rows } = await pool.query<{ fn: string; config: string[] | null; owner: string; acl: string[] }>(`
      select n.nspname || '.' || p.proname as fn, p.proconfig as config,
             pg_get_userbyid(p.proowner) as owner, p.proacl::text[] as acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.prosecdef and n.nspname = 'auth' order by 1`)
    for (const r of rows) {
      expect(r.config, r.fn).toEqual(['search_path=pg_catalog, public, pg_temp'])
      expect(r.owner, r.fn).toBe('zuru_owner')
      expect([...r.acl].sort(), r.fn).toEqual(['zuru_app=X/zuru_owner', 'zuru_owner=X/zuru_owner'])
    }
  })
})
