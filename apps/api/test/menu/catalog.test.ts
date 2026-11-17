// CRUD for categories, items and modifiers (SPEC §9 Menu).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '../support/app.js'
import { api, attachGroups, createCategory, createGroup, createItem, createOption } from '../support/menu.js'
import { appPool } from '../support/pg.js'
import { auditActions, roleShop, type RoleShop } from '../support/roles.js'

let t: TestApp
let shop: RoleShop
const pool = appPool(1)

beforeAll(async () => {
  t = await createTestApp()
  shop = await roleShop(t.app, 'catalog')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

describe('categories', () => {
  it('manager creates, renames, lists and archives a category', async () => {
    const m = shop.as.manager
    const cat = await createCategory(t.app, m, '  Non-Kopi  ', { sort: 2 })
    const patched = await api(t.app, m, 'PATCH', `/v1/categories/${cat.id}`, {
      name: 'Non Kopi',
      is_active: false,
    })
    expect(patched.json()).toMatchObject({ id: cat.id, name: 'Non Kopi', sort: 2, is_active: false })
    let list = (await api(t.app, m, 'GET', '/v1/categories')).json<{
      categories: { id: string; name: string }[]
    }>()
    expect(list.categories.find((c) => c.id === cat.id)?.name).toBe('Non Kopi')
    expect((await api(t.app, m, 'DELETE', `/v1/categories/${cat.id}`)).statusCode).toBe(204)
    list = (await api(t.app, m, 'GET', '/v1/categories')).json()
    expect(list.categories.map((c) => c.id)).not.toContain(cat.id)
    expect((await api(t.app, m, 'PATCH', `/v1/categories/${cat.id}`, { name: 'Back' })).statusCode).toBe(404)
  })

  it('names are trimmed and must not be blank', async () => {
    const cat = await createCategory(t.app, shop.as.owner, '  Kopi  ')
    expect((await api(t.app, shop.as.owner, 'GET', '/v1/categories')).body).toContain(
      `"id":"${cat.id}","name":"Kopi"`,
    )
    expect((await api(t.app, shop.as.owner, 'POST', '/v1/categories', { name: '   ' })).statusCode).toBe(400)
  })

  it('a category with live items cannot be archived', async () => {
    const cat = await createCategory(t.app, shop.as.owner, 'Makanan')
    const item = await createItem(t.app, shop.as.owner, cat.id, 'Croissant', 22000)
    const res = await api(t.app, shop.as.owner, 'DELETE', `/v1/categories/${cat.id}`)
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({
      error: { code: 'CONFLICT', details: { reason: 'category_has_items' } },
    })
    await api(t.app, shop.as.owner, 'DELETE', `/v1/items/${item.id}`)
    expect((await api(t.app, shop.as.owner, 'DELETE', `/v1/categories/${cat.id}`)).statusCode).toBe(204)
  })

  it.each(['cashier', 'employee'] as const)('%s cannot manage categories', async (role) => {
    expect((await api(t.app, shop.as[role], 'GET', '/v1/categories')).statusCode).toBe(403)
    expect((await api(t.app, shop.as[role], 'POST', '/v1/categories', { name: 'X' })).statusCode).toBe(403)
  })
})

describe('items', () => {
  it('creates an item with integer rupiah and defaults', async () => {
    const cat = await createCategory(t.app, shop.as.manager, 'Kopi')
    const item = await createItem(t.app, shop.as.manager, cat.id, 'Kopi Susu Gula Aren', 25000)
    const res = await api(t.app, shop.as.manager, 'GET', `/v1/items/${item.id}`)
    expect(res.json()).toEqual({
      id: item.id,
      category_id: cat.id,
      name: 'Kopi Susu Gula Aren',
      price: 25000,
      color: 'neutral',
      sort: 0,
      is_active: true,
      is_available: true,
      modifier_group_ids: [],
    })
  })

  it.each([
    [{ price: -1 }],
    [{ price: 1.5 }],
    [{ price: '25000' }],
    [{ price: 1_000_000_000_000 }],
    [{ color: 'chartreuse' }],
    [{ name: '' }],
  ])('rejects invalid input %o', async (patch) => {
    const cat = await createCategory(t.app, shop.as.owner, 'V')
    const res = await api(t.app, shop.as.owner, 'POST', '/v1/items', {
      category_id: cat.id,
      name: 'X',
      price: 1,
      ...patch,
    })
    expect(res.statusCode, res.body).toBe(400)
  })

  it('rejects an archived or unknown category', async () => {
    const cat = await createCategory(t.app, shop.as.owner, 'Gone')
    await api(t.app, shop.as.owner, 'DELETE', `/v1/categories/${cat.id}`)
    const res = await api(t.app, shop.as.owner, 'POST', '/v1/items', {
      category_id: cat.id,
      name: 'X',
      price: 1,
    })
    expect(res.statusCode).toBe(404)
  })

  it('a price change is audited with old and new price', async () => {
    const cat = await createCategory(t.app, shop.as.owner, 'Audit')
    const item = await createItem(t.app, shop.as.owner, cat.id, 'Latte', 28000)
    await api(t.app, shop.as.manager, 'PATCH', `/v1/items/${item.id}`, { price: 30000, name: 'Caffè Latte' })
    const entry = (await auditActions(pool, shop.tenantId)).find(
      (a) => a.action === 'menu.price_change' && a.entity_id === item.id,
    )
    expect(entry?.data).toEqual({ from: 28000, to: 30000 })
  })

  it('cashier toggles sold-out but cannot edit the item', async () => {
    const cat = await createCategory(t.app, shop.as.owner, 'Sold')
    const item = await createItem(t.app, shop.as.owner, cat.id, 'Matcha', 30000)
    const res = await api(t.app, shop.as.cashier, 'PATCH', `/v1/items/${item.id}/availability`, {
      is_available: false,
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ is_available: false })
    expect(
      (await api(t.app, shop.as.cashier, 'PATCH', `/v1/items/${item.id}`, { price: 1 })).statusCode,
    ).toBe(403)
    expect(
      (
        await api(t.app, shop.as.employee, 'PATCH', `/v1/items/${item.id}/availability`, {
          is_available: true,
        })
      ).statusCode,
    ).toBe(403)
  })

  it('lists by category; archived items disappear', async () => {
    const cat = await createCategory(t.app, shop.as.owner, 'Filter')
    const a = await createItem(t.app, shop.as.owner, cat.id, 'A', 1000, { sort: 2 })
    const b = await createItem(t.app, shop.as.owner, cat.id, 'B', 1000, { sort: 1 })
    await api(t.app, shop.as.owner, 'DELETE', `/v1/items/${a.id}`)
    const list = (await api(t.app, shop.as.owner, 'GET', `/v1/items?category_id=${cat.id}`)).json<{
      items: { id: string }[]
    }>()
    expect(list.items.map((i) => i.id)).toEqual([b.id])
  })
})

describe('modifier groups and options', () => {
  it('builds a group with options and attaches it to an item in order', async () => {
    const o = shop.as.owner
    const size = await createGroup(t.app, o, 'Ukuran', { min_select: 1 })
    const milk = await createGroup(t.app, o, 'Susu')
    const regular = await createOption(t.app, o, size.id, 'Regular', { is_default: true, sort: 0 })
    await createOption(t.app, o, size.id, 'Large', { price_delta: 5000, sort: 1 })
    const cat = await createCategory(t.app, o, 'Mods')
    const item = await createItem(t.app, o, cat.id, 'Kopi Susu', 25000)
    const res = await attachGroups(t.app, o, item.id, [milk.id, size.id])
    expect(res.json()).toMatchObject({ modifier_group_ids: [milk.id, size.id] })

    const groups = (await api(t.app, o, 'GET', '/v1/modifier-groups')).json<{
      groups: {
        id: string
        required: boolean
        max_select: number
        options: { id: string; price_delta: number }[]
      }[]
    }>()
    const sizeGroup = groups.groups.find((g) => g.id === size.id)
    expect(sizeGroup).toMatchObject({ required: true, max_select: 1, selection: 'single' })
    expect(sizeGroup?.options.map((x) => x.price_delta)).toEqual([0, 5000])
    expect(sizeGroup?.options[0]?.id).toBe(regular.id)
  })

  it('a single-select group keeps at most one default', async () => {
    const o = shop.as.owner
    const g = await createGroup(t.app, o, 'Gula')
    const normal = await createOption(t.app, o, g.id, 'Normal', { is_default: true })
    const less = await createOption(t.app, o, g.id, 'Less', { is_default: true })
    const options = (await api(t.app, o, 'GET', '/v1/modifier-groups'))
      .json<{
        groups: { id: string; options: { id: string; is_default: boolean }[] }[]
      }>()
      .groups.find((x) => x.id === g.id)?.options
    expect(options?.filter((x) => x.is_default).map((x) => x.id)).toEqual([less.id])
    expect(options?.map((x) => x.id)).toContain(normal.id)
  })

  it('a multi-select group cannot default to more options than max_select', async () => {
    const o = shop.as.owner
    const g = await createGroup(t.app, o, 'Tambahan', { selection: 'multiple', max_select: 1 })
    await createOption(t.app, o, g.id, 'Shot', { is_default: true })
    const res = await api(t.app, o, 'POST', '/v1/modifier-options', {
      group_id: g.id,
      name: 'Vanilla',
      is_default: true,
    })
    expect(res.statusCode).toBe(400)
    expect((await api(t.app, o, 'PATCH', `/v1/modifier-groups/${g.id}`, { max_select: 3 })).statusCode).toBe(
      200,
    )
    expect(
      (
        await api(t.app, o, 'POST', '/v1/modifier-options', {
          group_id: g.id,
          name: 'Vanilla',
          is_default: true,
        })
      ).statusCode,
    ).toBe(201)
    // Two defaults now: max can't drop below that.
    expect((await api(t.app, o, 'PATCH', `/v1/modifier-groups/${g.id}`, { max_select: 1 })).statusCode).toBe(
      400,
    )
  })

  it.each([
    [{ selection: 'single', max_select: 2 }],
    [{ selection: 'multiple', min_select: 3, max_select: 2 }],
    [{ selection: 'multiple', max_select: 0 }],
    [{ selection: 'some' }],
  ])('rejects invalid group rules %o', async (body) => {
    const res = await api(t.app, shop.as.owner, 'POST', '/v1/modifier-groups', { name: 'Bad', ...body })
    expect(res.statusCode, res.body).toBe(400)
  })

  it('rejects negative price deltas (MVP)', async () => {
    const g = await createGroup(t.app, shop.as.owner, 'Neg')
    const res = await api(t.app, shop.as.owner, 'POST', '/v1/modifier-options', {
      group_id: g.id,
      name: 'X',
      price_delta: -1000,
    })
    expect(res.statusCode).toBe(400)
  })

  it('archiving a group detaches it from items; archived groups cannot be attached', async () => {
    const o = shop.as.owner
    const g = await createGroup(t.app, o, 'Es')
    const cat = await createCategory(t.app, o, 'Detach')
    const item = await createItem(t.app, o, cat.id, 'Es Teh', 8000)
    await attachGroups(t.app, o, item.id, [g.id])
    expect((await api(t.app, o, 'DELETE', `/v1/modifier-groups/${g.id}`)).statusCode).toBe(204)
    expect((await api(t.app, o, 'GET', `/v1/items/${item.id}`)).json()).toMatchObject({
      modifier_group_ids: [],
    })
    expect(
      (await api(t.app, o, 'PUT', `/v1/items/${item.id}/modifier-groups`, { group_ids: [g.id] })).statusCode,
    ).toBe(404)
    expect(
      (await api(t.app, o, 'POST', '/v1/modifier-options', { group_id: g.id, name: 'X' })).statusCode,
    ).toBe(404)
  })

  it('archived options disappear from the group', async () => {
    const o = shop.as.owner
    const g = await createGroup(t.app, o, 'Arch')
    const opt = await createOption(t.app, o, g.id, 'Gone')
    expect((await api(t.app, o, 'DELETE', `/v1/modifier-options/${opt.id}`)).statusCode).toBe(204)
    const body = (await api(t.app, o, 'GET', '/v1/modifier-groups')).body
    expect(body).not.toContain(opt.id)
  })
})
