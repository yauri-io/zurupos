// GET /v1/device/bootstrap — the app's menu cache (SPEC §9, §11.2, D-040).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '../support/app.js'
import { kopiShop, type KopiShop } from '../support/kopi.js'
import { api, attachGroups, createItem, createOption } from '../support/menu.js'

type Bootstrap = {
  menu_version: string
  settings: Record<string, unknown>
  categories: { id: string; name: string }[]
  items: { id: string; name: string; price: number; is_available: boolean; modifier_group_ids: string[] }[]
  modifier_groups: {
    id: string
    name: string
    min_select: number
    max_select: number
    options: { id: string; name: string; price_delta: number; is_default: boolean }[]
  }[]
  discounts: { id: string; name: string; kind: string; value: number; scope: string }[]
}

let t: TestApp
let s: KopiShop

beforeAll(async () => {
  t = await createTestApp()
  s = await kopiShop(t.app, 'bootstrap')
})
afterAll(() => t.close())

const load = async (since?: string) => {
  const url = since ? `/v1/device/bootstrap?since=${since}` : '/v1/device/bootstrap'
  return api(t.app, s.as.cashier, 'GET', url)
}
const body = async () => {
  const res = await load()
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Bootstrap>()
}

describe('GET /device/bootstrap', () => {
  it('returns settings, the POS menu in sheet order and the presets', async () => {
    const b = await body()
    expect(b.settings).toMatchObject({ tax_enabled: true, tax_bps: 1000, tax_name: 'PB1' })
    expect(b.settings).not.toHaveProperty('alerts')
    expect(b.categories.map((c) => c.name)).toEqual(['Kopi', 'Makanan'])
    const kopi = b.items.find((i) => i.id === s.item.kopiSusu)
    expect(kopi).toMatchObject({ name: 'Kopi Susu Gula Aren', price: 25000, is_available: true })
    const names = kopi?.modifier_group_ids.map((id) => b.modifier_groups.find((g) => g.id === id)?.name)
    expect(names).toEqual(['Ukuran', 'Gula', 'Susu', 'Tambahan'])
    const size = b.modifier_groups.find((g) => g.name === 'Ukuran')
    expect(size).toMatchObject({ min_select: 1, max_select: 1 })
    expect(size?.options).toEqual([
      { id: s.opt.regular, name: 'Regular', price_delta: 0, is_default: true },
      { id: s.opt.large, name: 'Large', price_delta: 5000, is_default: false },
    ])
    expect(b.discounts).toEqual(
      expect.arrayContaining([
        { id: s.discount.item10, name: 'Diskon 10%', kind: 'percent', value: 1000, scope: 'item' },
        { id: s.discount.order5k, name: 'Potong 5rb', kind: 'fixed', value: 5000, scope: 'order' },
      ]),
    )
  })

  it('carries no costs, recipes or stock', async () => {
    const res = await load()
    for (const word of ['avg_cost', 'cogs', 'stock', 'recipe', 'ingredient', 'alert'])
      expect(res.body).not.toContain(word)
  })

  it('answers 304 for the current version and changes version when the menu changes', async () => {
    const v1 = (await body()).menu_version
    const same = await load(v1)
    expect(same.statusCode).toBe(304)
    expect(same.body).toBe('')

    // Sold out: still listed (greyed in the grid), with a new version.
    const soldOut = await api(t.app, s.as.cashier, 'PATCH', `/v1/items/${s.item.croissant}/availability`, {
      is_available: false,
    })
    expect(soldOut.statusCode).toBe(200)
    const b2 = await body()
    expect(b2.menu_version).not.toBe(v1)
    expect(b2.items.find((i) => i.id === s.item.croissant)?.is_available).toBe(false)
    expect((await load(v1)).statusCode).toBe(200)
  })

  it('a removed link, an archived option and an archived item leave the payload', async () => {
    const before = await body()
    const groupIds = before.items.find((i) => i.id === s.item.kopiSusu)?.modifier_group_ids ?? []
    const extra = await createOption(t.app, s.as.owner, groupIds[3] ?? '', 'Vanilla', { price_delta: 4000 })
    const item = await createItem(t.app, s.as.owner, before.categories[0]?.id ?? '', 'Americano', 20000)
    const withNew = await body()
    expect(withNew.items.map((i) => i.id)).toContain(item.id)

    await attachGroups(t.app, s.as.owner, s.item.kopiSusu, groupIds.slice(0, 3))
    const unlinked = await body()
    expect(unlinked.menu_version).not.toBe(withNew.menu_version)
    expect(unlinked.items.find((i) => i.id === s.item.kopiSusu)?.modifier_group_ids).toEqual(
      groupIds.slice(0, 3),
    )

    expect((await api(t.app, s.as.owner, 'DELETE', `/v1/modifier-options/${extra.id}`)).statusCode).toBe(204)
    expect((await api(t.app, s.as.owner, 'DELETE', `/v1/items/${item.id}`)).statusCode).toBe(204)
    const after = await body()
    expect(JSON.stringify(after)).not.toContain(extra.id)
    expect(after.items.map((i) => i.id)).not.toContain(item.id)
    await attachGroups(t.app, s.as.owner, s.item.kopiSusu, groupIds)
  })

  it('is for roles that take orders: employees get 403', async () => {
    expect((await api(t.app, s.as.manager, 'GET', '/v1/device/bootstrap')).statusCode).toBe(200)
    const res = await api(t.app, s.as.employee, 'GET', '/v1/device/bootstrap')
    expect(res.statusCode).toBe(403)
  })

  it('needs a staff or dashboard session', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/v1/device/bootstrap' })
    expect(res.statusCode).toBe(401)
  })
})
