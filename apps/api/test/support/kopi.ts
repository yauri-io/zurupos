// A complete demo shop built through the API: the SPEC §7.1 Kopi Susu menu with
// modifiers, effects and recipes, a croissant, presets, PB1 10% and stock on hand.
import { expectStatus, type Creds } from './app.js'
import type { App } from '../../src/http/types.js'
import {
  api,
  attachGroups,
  createCategory,
  createDiscount,
  createGroup,
  createIngredient,
  createItem,
  createOption,
  putEffects,
  putRecipe,
} from './menu.js'
import { roleShop, type RoleShop } from './roles.js'

export type IngKey = 'beans' | 'milk' | 'oat' | 'aren' | 'cup12' | 'cup16' | 'lid' | 'croissant'
export type OptKey = 'regular' | 'large' | 'normalSugar' | 'lessSugar' | 'freshMilk' | 'oat' | 'shot'

export type KopiShop = RoleShop & {
  ing: Record<IngKey, string>
  opt: Record<OptKey, string>
  item: { kopiSusu: string; croissant: string }
  discount: { item10: string; order5k: string }
}

const INGREDIENTS: [IngKey, string, string, string][] = [
  // key, name, unit, opening stock (stock-in qty)
  ['beans', 'Biji Kopi', 'g', '5000'],
  ['milk', 'Susu Segar', 'ml', '10000'],
  ['oat', 'Susu Oat', 'ml', '6000'],
  ['aren', 'Gula Aren', 'ml', '3000'],
  ['cup12', 'Cup 12oz', 'pcs', '200'],
  ['cup16', 'Cup 16oz', 'pcs', '200'],
  ['lid', 'Tutup', 'pcs', '400'],
  ['croissant', 'Croissant', 'pcs', '20'],
]

export const kopiShop = async (
  app: App,
  label: string,
  opts: { taxBps?: number; stock?: Partial<Record<IngKey, string>> } = {},
): Promise<KopiShop> => {
  const shop = await roleShop(app, label)
  const o: Creds = shop.as.owner
  expectStatus(
    await api(app, o, 'PATCH', '/v1/settings', { tax_enabled: true, tax_bps: opts.taxBps ?? 1000 }),
    200,
  )
  const ing = {} as Record<IngKey, string>
  for (const [key, name, unit, stock] of INGREDIENTS) {
    ing[key] = (await createIngredient(app, o, name, unit)).id
    const qty = opts.stock?.[key] ?? stock
    if (qty !== '0') {
      // Rp 10 per base unit, so costs are easy to check.
      expectStatus(
        await api(app, o, 'POST', '/v1/stock/in', {
          ingredient_id: ing[key],
          qty,
          total_cost: Number(qty) * 10,
        }),
        200,
      )
    }
  }
  const kopi = await createCategory(app, o, 'Kopi')
  const food = await createCategory(app, o, 'Makanan')
  const kopiSusu = (await createItem(app, o, kopi.id, 'Kopi Susu Gula Aren', 25000)).id
  const croissant = (await createItem(app, o, food.id, 'Croissant', 22000)).id
  await putRecipe(app, o, kopiSusu, [
    { ingredient_id: ing.beans, qty: '18' },
    { ingredient_id: ing.milk, qty: '150' },
    { ingredient_id: ing.aren, qty: '20' },
    { ingredient_id: ing.cup12, qty: '1' },
    { ingredient_id: ing.lid, qty: '1' },
  ])
  await putRecipe(app, o, croissant, [{ ingredient_id: ing.croissant, qty: '1' }])

  const size = await createGroup(app, o, 'Ukuran', { min_select: 1, sort: 0 })
  const sugar = await createGroup(app, o, 'Gula', { min_select: 1, sort: 1 })
  const milk = await createGroup(app, o, 'Susu', { min_select: 1, sort: 3 })
  const extra = await createGroup(app, o, 'Tambahan', { selection: 'multiple', max_select: 3, sort: 4 })
  const opt = {
    regular: (await createOption(app, o, size.id, 'Regular', { is_default: true })).id,
    large: (await createOption(app, o, size.id, 'Large', { price_delta: 5000, sort: 1 })).id,
    normalSugar: (await createOption(app, o, sugar.id, 'Normal', { is_default: true })).id,
    lessSugar: (await createOption(app, o, sugar.id, 'Less sugar', { sort: 1 })).id,
    freshMilk: (await createOption(app, o, milk.id, 'Susu segar', { is_default: true })).id,
    oat: (await createOption(app, o, milk.id, 'Oat milk', { price_delta: 6000, sort: 1 })).id,
    shot: (await createOption(app, o, extra.id, 'Extra shot', { price_delta: 5000 })).id,
  }
  await putEffects(app, o, opt.large, [
    { effect: 'replace', target_ingredient_id: ing.cup12, ingredient_id: ing.cup16 },
    { effect: 'add', ingredient_id: ing.milk, qty: '50' },
  ])
  await putEffects(app, o, opt.lessSugar, [
    { effect: 'replace', target_ingredient_id: ing.aren, ingredient_id: ing.aren, qty: '10' },
  ])
  await putEffects(app, o, opt.oat, [
    { effect: 'replace', target_ingredient_id: ing.milk, ingredient_id: ing.oat },
  ])
  await putEffects(app, o, opt.shot, [{ effect: 'add', ingredient_id: ing.beans, qty: '18' }])
  await attachGroups(app, o, kopiSusu, [size.id, sugar.id, milk.id, extra.id])

  const item10 = (await createDiscount(app, o, 'Diskon 10%', { kind: 'percent', value: 1000, scope: 'item' }))
    .id
  const order5k = (await createDiscount(app, o, 'Potong 5rb', { kind: 'fixed', value: 5000, scope: 'order' }))
    .id

  return { ...shop, ing, opt, item: { kopiSusu, croissant }, discount: { item10, order5k } }
}

// Plain Kopi Susu: the default of every required group.
export const plainKopi = (s: KopiShop) => [s.opt.regular, s.opt.normalSugar, s.opt.freshMilk]

export const stockOf = async (app: App, s: KopiShop) => {
  const res = expectStatus(await api(app, s.as.owner, 'GET', '/v1/ingredients'), 200).json<{
    ingredients: { id: string; stock_qty: string; avg_cost?: string }[]
  }>()
  const byId = new Map(res.ingredients.map((i) => [i.id, i.stock_qty]))
  return Object.fromEntries(Object.entries(s.ing).map(([k, id]) => [k, byId.get(id)])) as Record<
    IngKey,
    string
  >
}

export const invariant = async (app: App, s: KopiShop) =>
  expectStatus(await api(app, s.as.owner, 'GET', '/v1/admin/stock-invariant'), 200).json<{
    mismatches: unknown[]
  }>().mismatches
