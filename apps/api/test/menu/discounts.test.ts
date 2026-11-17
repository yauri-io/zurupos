import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '../support/app.js'
import { api, createDiscount } from '../support/menu.js'
import { roleShop, type RoleShop } from '../support/roles.js'

let t: TestApp
let shop: RoleShop

beforeAll(async () => {
  t = await createTestApp()
  shop = await roleShop(t.app, 'discounts')
})
afterAll(() => t.close())

describe('discounts', () => {
  it('manager creates percent and fixed presets, edits and archives them', async () => {
    const m = shop.as.manager
    const pct = await createDiscount(t.app, m, 'Member 10%', { kind: 'percent', value: 1000, scope: 'order' })
    const fixed = await createDiscount(t.app, m, 'Potong 5rb', { kind: 'fixed', value: 5000, scope: 'item' })
    const res = await api(t.app, m, 'PATCH', `/v1/discounts/${pct.id}`, { value: 1500, is_active: false })
    expect(res.json()).toMatchObject({ kind: 'percent', value: 1500, is_active: false })
    expect((await api(t.app, m, 'DELETE', `/v1/discounts/${fixed.id}`)).statusCode).toBe(204)
    const list = (await api(t.app, m, 'GET', '/v1/discounts')).json<{ discounts: { id: string }[] }>()
    expect(list.discounts.map((d) => d.id)).toEqual([pct.id])
  })

  it.each([
    [{ kind: 'percent', value: 10001 }],
    [{ kind: 'percent', value: 0 }],
    [{ kind: 'fixed', value: 0 }],
    [{ kind: 'fixed', value: 1.5 }],
    [{ scope: 'line' }],
  ])('rejects %o', async (body) => {
    const res = await api(t.app, shop.as.owner, 'POST', '/v1/discounts', {
      name: 'Bad',
      kind: 'percent',
      value: 1000,
      scope: 'order',
      ...body,
    })
    expect(res.statusCode, res.body).toBe(400)
  })

  it('changing kind requires a value valid for the new kind', async () => {
    const d = await createDiscount(t.app, shop.as.owner, 'Switch', { kind: 'fixed', value: 20000 })
    expect(
      (await api(t.app, shop.as.owner, 'PATCH', `/v1/discounts/${d.id}`, { kind: 'percent' })).statusCode,
    ).toBe(400)
    expect(
      (await api(t.app, shop.as.owner, 'PATCH', `/v1/discounts/${d.id}`, { kind: 'percent', value: 20000 }))
        .statusCode,
    ).toBe(400)
    const ok = await api(t.app, shop.as.owner, 'PATCH', `/v1/discounts/${d.id}`, {
      kind: 'percent',
      value: 2000,
    })
    expect(ok.json()).toMatchObject({ kind: 'percent', value: 2000 })
  })

  it.each(['cashier', 'employee'] as const)('%s cannot manage discounts', async (role) => {
    expect((await api(t.app, shop.as[role], 'GET', '/v1/discounts')).statusCode).toBe(403)
  })
})
