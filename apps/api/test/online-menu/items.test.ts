// Item fields for the online menu (SPEC §4.1, §12.7, PRD F18): show_online and
// is_recommended through PATCH /items/:id, the 5-item limit under the profile
// lock, and photos never reaching bootstrap or the cashier (D-079).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, expectStatus, type TestApp } from '../support/app.js'
import { solidImage } from '../support/images.js'
import { api, createCategory, createItem } from '../support/menu.js'
import { upload } from '../support/media.js'
import { appPool, inTx } from '../support/pg.js'
import { roleShop, type RoleShop } from '../support/roles.js'

let t: TestApp
let shop: RoleShop
const pool = appPool(1)

beforeAll(async () => {
  t = await createTestApp()
  shop = await roleShop(t.app, 'omitems')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

type Item = { id: string; show_online: boolean; is_recommended: boolean; photo: unknown }

const items = async (s: RoleShop, n: number) => {
  const cat = await createCategory(t.app, s.as.owner, `C ${Math.random().toString(36).slice(2, 8)}`)
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push((await createItem(t.app, s.as.owner, cat.id, `Item ${i}`)).id)
  return out
}
const patchItem = (s: RoleShop, id: string, body: unknown, who: keyof RoleShop['as'] = 'owner') =>
  api(t.app, s.as[who], 'PATCH', `/v1/items/${id}`, body)
const recommendedCount = async (s: RoleShop) =>
  expectStatus(await api(t.app, s.as.owner, 'GET', '/v1/online-menu'), 200).json<{
    recommended_count: number
  }>().recommended_count

describe('show_online and is_recommended', () => {
  it('manager can hide an item online and mark it recommended', async () => {
    const [id = ''] = await items(shop, 1)
    const res = expectStatus(
      await patchItem(shop, id, { show_online: false, is_recommended: true }, 'manager'),
      200,
    )
    expect(res.json<Item>()).toMatchObject({ show_online: false, is_recommended: true, photo: null })
    expect(
      expectStatus(await api(t.app, shop.as.manager, 'GET', `/v1/items/${id}`), 200).json<Item>(),
    ).toMatchObject({
      show_online: false,
      is_recommended: true,
    })
  })

  it('cashier and employee cannot change them', async () => {
    const [id = ''] = await items(shop, 1)
    for (const who of ['cashier', 'employee'] as const) {
      expect((await patchItem(shop, id, { is_recommended: true }, who)).statusCode, who).toBe(403)
    }
  })

  it('at most 5 recommended: the 6th is 409 recommended_limit', async () => {
    const own = await roleShop(t.app, 'omrec')
    const ids = await items(own, 7)
    for (const id of ids.slice(0, 5)) expectStatus(await patchItem(own, id, { is_recommended: true }), 200)
    expect(await recommendedCount(own)).toBe(5)
    const sixth = await patchItem(own, ids[5] ?? '', { is_recommended: true, name: 'Not saved' })
    expect(sixth.statusCode).toBe(409)
    expect(sixth.json()).toMatchObject({
      error: { code: 'CONFLICT', details: { reason: 'recommended_limit' } },
    })
    const unchanged = expectStatus(
      await api(t.app, own.as.owner, 'GET', `/v1/items/${ids[5] ?? ''}`),
      200,
    ).json<{
      name: string
      is_recommended: boolean
    }>()
    expect(unchanged).toMatchObject({ name: 'Item 5', is_recommended: false })

    // At the limit, an already recommended item can still be saved with true.
    expectStatus(await patchItem(own, ids[0] ?? '', { is_recommended: true, price: 26000 }), 200)
    // Un-recommending frees a place.
    expectStatus(await patchItem(own, ids[0] ?? '', { is_recommended: false }), 200)
    expectStatus(await patchItem(own, ids[5] ?? '', { is_recommended: true }), 200)
    // Archived items don't count.
    expectStatus(await api(t.app, own.as.owner, 'DELETE', `/v1/items/${ids[1] ?? ''}`), 204)
    expect(await recommendedCount(own)).toBe(4)
    expectStatus(await patchItem(own, ids[6] ?? '', { is_recommended: true }), 200)
    expect(await recommendedCount(own)).toBe(5)
  })

  it('two parallel requests for the last place: exactly one wins', async () => {
    for (let round = 0; round < 3; round++) {
      const own = await roleShop(t.app, `omrecpar${round}`)
      const ids = await items(own, 6)
      for (const id of ids.slice(0, 4)) expectStatus(await patchItem(own, id, { is_recommended: true }), 200)
      const results = await Promise.all([
        patchItem(own, ids[4] ?? '', { is_recommended: true }),
        patchItem(own, ids[5] ?? '', { is_recommended: true }),
      ])
      expect(results.map((r) => r.statusCode).sort(), `round ${round}`).toEqual([200, 409])
      expect(await recommendedCount(own)).toBe(5)
    }
  })
})

describe('bootstrap and the cashier never see online-menu fields (D-079)', () => {
  const ITEM_KEYS = ['category_id', 'color', 'id', 'is_available', 'modifier_group_ids', 'name', 'price']

  it('bootstrap items keep exactly their fields, hidden-online items stay in the POS', async () => {
    const [id = ''] = await items(shop, 1)
    expectStatus(
      await upload(t.app, shop.as.owner, 'PUT', `/v1/items/${id}/photo`, await solidImage(800, 600)),
      200,
    )
    expectStatus(await patchItem(shop, id, { show_online: false, is_recommended: true }), 200)
    const res = expectStatus(await api(t.app, shop.as.cashier, 'GET', '/v1/device/bootstrap'), 200)
    const body = res.json<{ items: Record<string, unknown>[] }>()
    const mine = body.items.find((i) => i['id'] === id)
    expect(mine).toBeDefined()
    for (const item of body.items) expect(Object.keys(item).sort()).toEqual(ITEM_KEYS)
    for (const word of ['photo', 'show_online', 'is_recommended', '/media/', '.webp']) {
      expect(res.body).not.toContain(word)
    }
  })

  // D-085: menu_version is a hash of the bootstrap payload (D-040), which has no
  // online-menu fields, so these changes don't make devices refetch at all; the
  // item's updated_at still moves (§4, delta-sync readiness).
  it('changing show_online, is_recommended or the photo bumps updated_at but not menu_version', async () => {
    const [id = ''] = await items(shop, 1)
    const version = async () =>
      expectStatus(await api(t.app, shop.as.cashier, 'GET', '/v1/device/bootstrap'), 200).json<{
        menu_version: string
      }>().menu_version
    const updatedAt = () =>
      inTx(pool, shop.tenantId, async (c) => {
        const { rows } = await c.query<{ u: string }>(
          'select updated_at::text as u from items where id = $1',
          [id],
        )
        return rows[0]?.u
      })
    const v = await version()
    let stamp = await updatedAt()
    for (const change of [
      () => patchItem(shop, id, { show_online: false }),
      () => patchItem(shop, id, { is_recommended: true }),
      async () => upload(t.app, shop.as.owner, 'PUT', `/v1/items/${id}/photo`, await solidImage(400, 400)),
      () => api(t.app, shop.as.owner, 'DELETE', `/v1/items/${id}/photo`),
    ]) {
      expectStatus(await change(), 200)
      const next = await updatedAt()
      expect(next).not.toBe(stamp)
      stamp = next
      expect(await version()).toBe(v)
      expect((await api(t.app, shop.as.cashier, 'GET', `/v1/device/bootstrap?since=${v}`)).statusCode).toBe(
        304,
      )
    }
  })

  it('the availability response for the cashier has no photo fields', async () => {
    const [id = ''] = await items(shop, 1)
    expectStatus(
      await upload(t.app, shop.as.owner, 'PUT', `/v1/items/${id}/photo`, await solidImage(400, 400)),
      200,
    )
    const res = expectStatus(
      await api(t.app, shop.as.cashier, 'PATCH', `/v1/items/${id}/availability`, { is_available: false }),
      200,
    )
    expect(Object.keys(res.json<Record<string, unknown>>()).sort()).toEqual(
      [...ITEM_KEYS, 'is_active', 'sort'].sort(),
    )
    expect(res.body).not.toContain('.webp')
  })
})
