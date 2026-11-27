// D-081: auth.find_public_menu(slug), the sixth reviewed pre-tenant function.
// It returns only (tenant_id, current_slug), only for a published menu of a shop
// with an active owner, and only zuru_app may call it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '../support/app.js'
import { api } from '../support/menu.js'
import { appPool, inTx, workerPool } from '../support/pg.js'
import { roleShop, type RoleShop } from '../support/roles.js'

let t: TestApp
const pool = appPool(2)
let published: RoleShop
let unpublished: RoleShop
let noOwner: RoleShop
const slug = (label: string) => `fpm-${label}-${Math.random().toString(36).slice(2, 8)}`
const slugs = { old: slug('old'), current: slug('cur'), unpublished: slug('unpub'), noOwner: slug('noown') }

type Row = Record<string, unknown>
const find = (s: string) =>
  inTx(pool, null, async (c) => (await c.query<Row>('select * from auth.find_public_menu($1)', [s])).rows)

beforeAll(async () => {
  t = await createTestApp()
  published = await roleShop(t.app, 'fpm-pub')
  unpublished = await roleShop(t.app, 'fpm-unpub')
  noOwner = await roleShop(t.app, 'fpm-noowner')
  const setSlug = (s: RoleShop, value: string) =>
    api(t.app, s.as.owner, 'PATCH', '/v1/online-menu', { slug: value })
  const publish = (s: RoleShop) => api(t.app, s.as.owner, 'POST', '/v1/online-menu/publish')
  await setSlug(published, slugs.old)
  await setSlug(published, slugs.current)
  await publish(published)
  await setSlug(unpublished, slugs.unpublished)
  await setSlug(noOwner, slugs.noOwner)
  await publish(noOwner)
  await inTx(pool, noOwner.tenantId, (c) =>
    c.query(`update users set is_active = false where role = 'owner'`),
  )
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

describe('auth.find_public_menu() (D-081)', () => {
  it('has exactly the input slug and the two output columns', async () => {
    const fn = await inTx(
      pool,
      null,
      async (c) =>
        (
          await c.query<{ names: string[]; modes: string[]; volatile: string }>(
            `select proargnames as names, proargmodes::text[] as modes, provolatile as volatile
             from pg_proc where oid = 'auth.find_public_menu(citext)'::regprocedure`,
          )
        ).rows[0],
    )
    expect(fn).toEqual({
      names: ['p_slug', 'tenant_id', 'current_slug'],
      modes: ['i', 't', 't'],
      volatile: 's',
    })
    const rows = await find(slugs.current)
    expect(rows).toEqual([{ tenant_id: published.tenantId, current_slug: slugs.current }])
  })

  it('an old slug of a published shop resolves to its current slug', async () => {
    expect(await find(slugs.old)).toEqual([{ tenant_id: published.tenantId, current_slug: slugs.current }])
  })

  it('is case-insensitive like the slug key', async () => {
    expect(await find(slugs.current.toUpperCase())).toHaveLength(1)
  })

  it('no row for an unpublished menu, a shop without an active owner, or an unknown slug', async () => {
    expect(await find(slugs.unpublished)).toEqual([])
    expect(await find(slugs.noOwner)).toEqual([])
    expect(await find('fpm-does-not-exist')).toEqual([])
    expect(await find('')).toEqual([])
  })

  it('does not open menu_slugs, menu_profiles or users to zuru_app', async () => {
    const counts = await inTx(pool, null, async (c) => ({
      slugs: (await c.query('select 1 from menu_slugs')).rowCount,
      profiles: (await c.query('select 1 from menu_profiles')).rowCount,
      users: (await c.query('select 1 from users')).rowCount,
    }))
    expect(counts).toEqual({ slugs: 0, profiles: 0, users: 0 })
  })

  it('cannot be executed by zuru_worker', async () => {
    const worker = workerPool(1)
    try {
      await expect(
        worker.query('select * from auth.find_public_menu($1)', [slugs.current]),
      ).rejects.toMatchObject({
        code: '42501',
      })
    } finally {
      await worker.end()
    }
  })
})
