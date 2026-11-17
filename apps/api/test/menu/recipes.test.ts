// Recipes, modifier effects and the recipe preview (SPEC §7.1, UAT #3).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Creds } from '../support/app.js'
import { createTestApp, type TestApp } from '../support/app.js'
import {
  api,
  attachGroups,
  createCategory,
  createGroup,
  createIngredient,
  createItem,
  createOption,
  putEffects,
  putRecipe,
} from '../support/menu.js'
import { appPool } from '../support/pg.js'
import { auditActions, roleShop, type RoleShop } from '../support/roles.js'

let t: TestApp
let shop: RoleShop
let o: Creds
const pool = appPool(1)

type IngKey = 'beans' | 'milk' | 'oat' | 'aren' | 'vanilla' | 'cup12' | 'cup16' | 'lid'
type OptKey = 'regular' | 'large' | 'lessSugar' | 'oat' | 'shot' | 'vanilla'
const ing = {} as Record<IngKey, string>
const opt = {} as Record<OptKey, string>
let kopiSusu: string
let croissant: string

beforeAll(async () => {
  t = await createTestApp()
  shop = await roleShop(t.app, 'recipes')
  o = shop.as.manager
  for (const [key, name, unit] of [
    ['beans', 'Biji Kopi', 'g'],
    ['milk', 'Susu Segar', 'ml'],
    ['oat', 'Susu Oat', 'ml'],
    ['aren', 'Gula Aren', 'ml'],
    ['vanilla', 'Sirup Vanila', 'ml'],
    ['cup12', 'Cup 12oz', 'pcs'],
    ['cup16', 'Cup 16oz', 'pcs'],
    ['lid', 'Tutup', 'pcs'],
  ] as const) {
    ing[key] = (await createIngredient(t.app, o, name, unit)).id
  }
  const cat = await createCategory(t.app, o, 'Kopi')
  kopiSusu = (await createItem(t.app, o, cat.id, 'Kopi Susu Gula Aren', 25000)).id
  croissant = (await createItem(t.app, o, cat.id, 'Croissant', 22000)).id
  await putRecipe(t.app, o, kopiSusu, [
    { ingredient_id: ing.beans, qty: '18' },
    { ingredient_id: ing.milk, qty: '150' },
    { ingredient_id: ing.aren, qty: '20' },
    { ingredient_id: ing.cup12, qty: '1' },
    { ingredient_id: ing.lid, qty: '1' },
  ])

  const size = await createGroup(t.app, o, 'Ukuran', { sort: 0 })
  const sugar = await createGroup(t.app, o, 'Gula', { sort: 1 })
  const milk = await createGroup(t.app, o, 'Susu', { sort: 3 })
  const extra = await createGroup(t.app, o, 'Tambahan', { sort: 4, selection: 'multiple', max_select: 3 })
  opt.regular = (await createOption(t.app, o, size.id, 'Regular', { is_default: true })).id
  opt.large = (await createOption(t.app, o, size.id, 'Large', { price_delta: 5000, sort: 1 })).id
  opt.lessSugar = (await createOption(t.app, o, sugar.id, 'Less sugar', { sort: 1 })).id
  opt.oat = (await createOption(t.app, o, milk.id, 'Oat milk', { price_delta: 6000, sort: 1 })).id
  opt.shot = (await createOption(t.app, o, extra.id, 'Extra shot', { price_delta: 5000 })).id
  opt.vanilla = (await createOption(t.app, o, extra.id, 'Vanilla', { price_delta: 4000, sort: 1 })).id
  await putEffects(t.app, o, opt.large, [
    { effect: 'replace', target_ingredient_id: ing.cup12, ingredient_id: ing.cup16 },
    { effect: 'add', ingredient_id: ing.milk, qty: '50' },
  ])
  await putEffects(t.app, o, opt.lessSugar, [
    { effect: 'replace', target_ingredient_id: ing.aren, ingredient_id: ing.aren, qty: '10' },
  ])
  await putEffects(t.app, o, opt.oat, [
    { effect: 'replace', target_ingredient_id: ing.milk, ingredient_id: ing.oat },
  ])
  await putEffects(t.app, o, opt.shot, [{ effect: 'add', ingredient_id: ing.beans, qty: '18' }])
  await putEffects(t.app, o, opt.vanilla, [{ effect: 'add', ingredient_id: ing.vanilla, qty: '15' }])
  await attachGroups(t.app, o, kopiSusu, [size.id, sugar.id, milk.id, extra.id])
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

const preview = async (itemId: string, options: OptKey[], qty?: number): Promise<Record<string, string>> => {
  const res = await api(t.app, o, 'POST', '/v1/recipes/preview', {
    item_id: itemId,
    option_ids: options.map((k) => opt[k]),
    ...(qty === undefined ? {} : { qty }),
  })
  expect(res.statusCode, res.body).toBe(200)
  const body = res.json<{ ingredients: { ingredient_id: string; qty: string }[] }>()
  const byKey = new Map(Object.entries(ing).map(([k, id]) => [id, k]))
  return Object.fromEntries(
    body.ingredients.map((i) => [byKey.get(i.ingredient_id) ?? i.ingredient_id, i.qty]),
  )
}

describe('POST /recipes/preview (SPEC §7.1 examples)', () => {
  it('Kopi Susu + Oat + Extra shot + Less sugar ×2', async () => {
    expect(await preview(kopiSusu, ['oat', 'shot', 'lessSugar'], 2)).toEqual({
      beans: '72',
      oat: '300',
      aren: '20',
      cup12: '2',
      lid: '2',
    })
  })

  it('Kopi Susu + Large + Oat: the extra milk goes to oat, fresh milk 0', async () => {
    const result = await preview(kopiSusu, ['large', 'oat'])
    expect(result).toEqual({ beans: '18', oat: '200', aren: '20', cup16: '1', lid: '1' })
    expect(result).not.toHaveProperty('milk')
  })

  it('UAT #3: Large + Oat + Extra shot', async () => {
    expect(await preview(kopiSusu, ['large', 'oat', 'shot'])).toEqual({
      beans: '36',
      oat: '200',
      aren: '20',
      cup16: '1',
      lid: '1',
    })
  })

  it('an add on an ingredient that was not replaced is simply added', async () => {
    expect(await preview(kopiSusu, ['vanilla'])).toMatchObject({ milk: '150', vanilla: '15' })
  })

  it('an item with no recipe previews empty', async () => {
    expect(await preview(croissant, [])).toEqual({})
  })

  it('rejects options whose group is not attached to the item', async () => {
    const res = await api(t.app, o, 'POST', '/v1/recipes/preview', {
      item_id: croissant,
      option_ids: [opt.oat],
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: { details: { problem: 'option_not_on_item' } } })
  })
})

describe('PUT /items/:id/recipe', () => {
  it('returns lines with names, units and canonical quantities; audits the change', async () => {
    const res = await api(t.app, o, 'GET', `/v1/items/${kopiSusu}/recipe`)
    expect(res.json<{ lines: unknown[] }>().lines).toContainEqual({
      ingredient_id: ing.beans,
      ingredient_name: 'Biji Kopi',
      base_unit: 'g',
      ingredient_archived: false,
      qty: '18',
    })
    const audit = (await auditActions(pool, shop.tenantId)).filter(
      (a) => a.action === 'recipe.change' && a.entity_id === kopiSusu,
    )
    expect(audit).toHaveLength(1)
  })

  it.each([
    [
      'duplicate ingredient',
      () => [
        { ingredient_id: ing.beans, qty: '1' },
        { ingredient_id: ing.beans, qty: '2' },
      ],
    ],
    ['zero qty', () => [{ ingredient_id: ing.beans, qty: '0' }]],
    ['numeric qty', () => [{ ingredient_id: ing.beans, qty: 5 }]],
    ['too many decimals', () => [{ ingredient_id: ing.beans, qty: '0.0001' }]],
  ])('rejects %s', async (_, lines) => {
    const res = await api(t.app, o, 'PUT', `/v1/items/${croissant}/recipe`, { lines: lines() })
    expect(res.statusCode, res.body).toBe(400)
  })

  it('archived ingredients can stay in a recipe but not be newly added', async () => {
    const cat = await createCategory(t.app, o, 'Arsip')
    const item = (await createItem(t.app, o, cat.id, 'Teh', 8000)).id
    const tea = (await createIngredient(t.app, o, 'Daun Teh', 'g')).id
    await putRecipe(t.app, o, item, [{ ingredient_id: tea, qty: '5' }])
    await api(t.app, o, 'DELETE', `/v1/ingredients/${tea}`)
    // Unchanged recipe saves fine and shows the archived flag.
    const kept = await putRecipe(t.app, o, item, [{ ingredient_id: tea, qty: '6' }])
    expect(kept).toMatchObject({ lines: [{ ingredient_id: tea, qty: '6', ingredient_archived: true }] })
    const other = await createItem(t.app, o, cat.id, 'Teh Tarik', 12000)
    const res = await api(t.app, o, 'PUT', `/v1/items/${other.id}/recipe`, {
      lines: [{ ingredient_id: tea, qty: '5' }],
    })
    expect(res.statusCode).toBe(404)
  })

  it.each(['cashier', 'employee'] as const)('%s cannot read or edit recipes', async (role) => {
    expect((await api(t.app, shop.as[role], 'GET', `/v1/items/${kopiSusu}/recipe`)).statusCode).toBe(403)
    expect(
      (await api(t.app, shop.as[role], 'POST', '/v1/recipes/preview', { item_id: kopiSusu, option_ids: [] }))
        .statusCode,
    ).toBe(403)
  })
})

describe('PUT /modifier-options/:id/effects', () => {
  it('returns effects in order with ingredient names', async () => {
    const res = await api(t.app, o, 'GET', `/v1/modifier-options/${opt.large}/effects`)
    expect(res.json()).toEqual({
      option_id: opt.large,
      effects: [
        {
          effect: 'replace',
          ingredient_id: ing.cup16,
          ingredient_name: 'Cup 16oz',
          base_unit: 'pcs',
          ingredient_archived: false,
          target_ingredient_id: ing.cup12,
          target_ingredient_name: 'Cup 12oz',
          qty: null,
        },
        {
          effect: 'add',
          ingredient_id: ing.milk,
          ingredient_name: 'Susu Segar',
          base_unit: 'ml',
          ingredient_archived: false,
          target_ingredient_id: null,
          target_ingredient_name: null,
          qty: '50',
        },
      ],
    })
  })

  it.each([
    ['add without qty', () => ({ effect: 'add', ingredient_id: ing.vanilla })],
    [
      'add with target',
      () => ({ effect: 'add', ingredient_id: ing.vanilla, qty: '1', target_ingredient_id: ing.milk }),
    ],
    ['remove with qty', () => ({ effect: 'remove', ingredient_id: ing.vanilla, qty: '1' })],
    ['replace without target', () => ({ effect: 'replace', ingredient_id: ing.oat })],
    [
      'same-ingredient replace without qty',
      () => ({ effect: 'replace', ingredient_id: ing.oat, target_ingredient_id: ing.oat }),
    ],
    ['zero qty', () => ({ effect: 'add', ingredient_id: ing.vanilla, qty: '0' })],
    ['unknown effect', () => ({ effect: 'swap', ingredient_id: ing.vanilla })],
  ])('rejects %s', async (_, effect) => {
    const res = await api(t.app, o, 'PUT', `/v1/modifier-options/${opt.vanilla}/effects`, {
      effects: [effect()],
    })
    expect(res.statusCode, res.body).toBe(400)
  })

  it('a remove effect deletes the ingredient from the preview', async () => {
    const g = await createGroup(t.app, o, 'Tanpa')
    const noLid = await createOption(t.app, o, g.id, 'Tanpa tutup')
    await putEffects(t.app, o, noLid.id, [{ effect: 'remove', ingredient_id: ing.lid }])
    const cat = await createCategory(t.app, o, 'Remove')
    const item = await createItem(t.app, o, cat.id, 'Kopi Hitam', 18000)
    await putRecipe(t.app, o, item.id, [
      { ingredient_id: ing.beans, qty: '18' },
      { ingredient_id: ing.lid, qty: '1' },
    ])
    await attachGroups(t.app, o, item.id, [g.id])
    const res = await api(t.app, o, 'POST', '/v1/recipes/preview', {
      item_id: item.id,
      option_ids: [noLid.id],
    })
    expect(
      res.json<{ ingredients: { ingredient_id: string }[] }>().ingredients.map((i) => i.ingredient_id),
    ).toEqual([ing.beans])
  })
})
