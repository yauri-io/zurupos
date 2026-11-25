// SPEC §12.5 menu matrix against a seeded shop, every value by hand.
//
// Kopi shop (PB1 10%, every costed ingredient Rp 10 per base unit). All orders on
// 2026-11-10; the range is November (30 days). Category "Kopi":
//   item              price   recipe (cost)                         sold  net      COGS    margin   / portion
//   Kopi Susu Aren    25 000  beans 18, milk 150, aren 20, cup, lid 10    250 000  19 000  231 000  23 100
//   Americano         20 000  beans 18, cup, lid (200)              10    200 000   2 000  198 000  19 800
//   Kopi Hitam        25 000  beans 15, cup (160)                    2     50 000     320   49 680  24 840
//   Es Kopi Murah      8 000  beans 18, milk 300, cup (3 190)        10     80 000  31 900   48 100   4 810
//   Kopi Tubruk        6 000  beans 18, cup (190); archived after     1      6 000     190    5 810   5 810
//   Latte Vanila      28 000  costed, but its Sirup group adds an    3     84 000  → incomplete: ingredient_without_cost
//                             uncosted Sirup Vanila
//   Teh Tarik         12 000  no recipe                              2     24 000  → incomplete: no_recipe, sold_without_cost
// Included N 5, Q 33, M 532 590 → average Rp 16.139 a portion (16 139,09).
// Popular: qty × 50 ≥ 231 → qty ≥ 4,62. High: margin × 33 ≥ 532 590 × qty.
//   Kopi Susu, Americano → andalan; Es Kopi Murah → naikkan_harga; Kopi Hitam → promosikan;
//   Kopi Tubruk → evaluasi. Es Kopi Murah gap 16 139 − 4 810 = 11 329 → Rp 12.000, but it
//   sells at Rp 8.000 a portion: capped at 10 % → Rp 1.000 (D-076);
//   extra 30 days = 1 000 × 10 × 30 / 30 = 10 000.
// Coverage 586 000 / 694 000 = 84,44 %.
// "Makanan": Croissant only → too_few_items. "Minuman Lain": Teh Manis (no recipe,
// 50 000) and Air Mineral (10 000) → 16,67 % covered → incomplete_costs.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, expectStatus, type TestApp } from '../support/app.js'
import { kopiShop, plainKopi, type KopiShop } from '../support/kopi.js'
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
import { appPool, inTx } from '../support/pg.js'

let t: TestApp
let s: KopiShop
const pool = appPool(1)
const RANGE = 'from=2026-11-01&to=2026-11-30'
const id: Record<string, string> = {}
const cat: Record<string, string> = {}

const sell = async (itemId: string, qty: number, price: number, optionIds?: string[]) => {
  const res = expectStatus(
    await api(t.app, s.as.cashier, 'POST', '/v1/orders', {
      client_order_id: randomUUID(),
      order_type: 'takeaway',
      lines: [{ item_id: itemId, qty, ...(optionIds ? { option_ids: optionIds } : {}) }],
      payments: [{ method: 'qris', amount: (qty * price * 11) / 10 }],
    }),
    201,
  )
  const orderId = res.json<{ id: string }>().id
  await inTx(pool, s.tenantId, (c) =>
    c.query(`update orders set business_date = '2026-11-10', paid_at = '2026-11-10 09:00+07' where id = $1`, [
      orderId,
    ]),
  )
}

beforeAll(async () => {
  t = await createTestApp()
  s = await kopiShop(t.app, 'matrix')
  const o = s.as.owner
  const categories = expectStatus(await api(t.app, o, 'GET', '/v1/categories'), 200).json<{
    categories: { id: string; name: string }[]
  }>().categories
  for (const c of categories) cat[c.name] = c.id
  const kopi = cat['Kopi'] ?? ''
  const item = async (key: string, name: string, price: number, recipe?: [string, string][]) => {
    id[key] = (await createItem(t.app, o, kopi, name, price)).id
    if (recipe) {
      await putRecipe(
        t.app,
        o,
        id[key] ?? '',
        recipe.map(([ingredient_id, qty]) => ({ ingredient_id, qty })),
      )
    }
  }
  const { beans, milk, cup12, lid } = s.ing
  await item('americano', 'Americano', 20000, [
    [beans, '18'],
    [cup12, '1'],
    [lid, '1'],
  ])
  await item('hitam', 'Kopi Hitam', 25000, [
    [beans, '15'],
    [cup12, '1'],
  ])
  await item('murah', 'Es Kopi Murah', 8000, [
    [beans, '18'],
    [milk, '300'],
    [cup12, '1'],
  ])
  await item('tubruk', 'Kopi Tubruk', 6000, [
    [beans, '18'],
    [cup12, '1'],
  ])
  await item('latte', 'Latte Vanila', 28000, [
    [beans, '18'],
    [milk, '150'],
    [cup12, '1'],
  ])
  await item('tehTarik', 'Teh Tarik', 12000)
  // An optional syrup group on the latte whose ingredient has no cost yet.
  const syrup = await createIngredient(t.app, o, 'Sirup Vanila', 'ml')
  const group = await createGroup(t.app, o, 'Sirup')
  const vanilla = await createOption(t.app, o, group.id, 'Vanila', { price_delta: 3000 })
  await putEffects(t.app, o, vanilla.id, [{ effect: 'add', ingredient_id: syrup.id, qty: '15' }])
  await attachGroups(t.app, o, id['latte'] ?? '', [group.id])

  const other = await createCategory(t.app, o, 'Minuman Lain')
  cat['Minuman Lain'] = other.id
  id['tehManis'] = (await createItem(t.app, o, other.id, 'Teh Manis', 10000)).id
  id['air'] = (await createItem(t.app, o, other.id, 'Air Mineral', 5000)).id
  await putRecipe(t.app, o, id['air'] ?? '', [{ ingredient_id: cup12, qty: '1' }])

  await sell(s.item.kopiSusu, 10, 25000, plainKopi(s))
  await sell(id['americano'] ?? '', 10, 20000)
  await sell(id['hitam'] ?? '', 2, 25000)
  await sell(id['murah'] ?? '', 10, 8000)
  await sell(id['tubruk'] ?? '', 1, 6000)
  await sell(id['latte'] ?? '', 3, 28000)
  await sell(id['tehTarik'] ?? '', 2, 12000)
  await sell(s.item.croissant, 1, 22000)
  await sell(id['tehManis'] ?? '', 5, 10000)
  await sell(id['air'] ?? '', 2, 5000)
  // Archived after it sold: it still shows, marked archived.
  expectStatus(await api(t.app, o, 'DELETE', `/v1/items/${id['tubruk'] ?? ''}`), 204)
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

const get = (query: string, creds = s.as.owner) =>
  api(t.app, creds, 'GET', `/v1/reports/menu-matrix?${query}`)
const matrix = async (query: string) => expectStatus(await get(query), 200).json<Record<string, unknown>>()

const none = { suggested_increase: null, extra_30d: null }

describe('GET /v1/reports/menu-matrix', () => {
  it('defaults to the category with the highest net sales and places every item', async () => {
    const m = await matrix(RANGE)
    expect(m['category_id']).toBe(cat['Kopi'])
    expect(m['categories']).toEqual([
      { id: cat['Kopi'], name: 'Kopi', net: 694000 },
      { id: cat['Minuman Lain'], name: 'Minuman Lain', net: 60000 },
      { id: cat['Makanan'], name: 'Makanan', net: 22000 },
    ])
    expect(m).toMatchObject({ state: 'ok', coverage_bps: 8444, avg_margin_per_portion: 16139 })
    expect(m['items']).toEqual([
      {
        item_id: s.item.kopiSusu,
        name: 'Kopi Susu Gula Aren',
        archived: false,
        qty: 10,
        net: 250000,
        cogs: 19000,
        margin: 231000,
        margin_per_portion: 23100,
        quadrant: 'andalan',
        ...none,
      },
      {
        item_id: id['americano'],
        name: 'Americano',
        archived: false,
        qty: 10,
        net: 200000,
        cogs: 2000,
        margin: 198000,
        margin_per_portion: 19800,
        quadrant: 'andalan',
        ...none,
      },
      {
        item_id: id['murah'],
        name: 'Es Kopi Murah',
        archived: false,
        qty: 10,
        net: 80000,
        cogs: 31900,
        margin: 48100,
        margin_per_portion: 4810,
        quadrant: 'naikkan_harga',
        suggested_increase: 1000,
        extra_30d: 10000,
      },
      {
        item_id: id['hitam'],
        name: 'Kopi Hitam',
        archived: false,
        qty: 2,
        net: 50000,
        cogs: 320,
        margin: 49680,
        margin_per_portion: 24840,
        quadrant: 'promosikan',
        ...none,
      },
      {
        item_id: id['tubruk'],
        name: 'Kopi Tubruk',
        archived: true,
        qty: 1,
        net: 6000,
        cogs: 190,
        margin: 5810,
        margin_per_portion: 5810,
        quadrant: 'evaluasi',
        ...none,
      },
    ])
    expect(m['incomplete']).toEqual([
      {
        item_id: id['latte'],
        name: 'Latte Vanila',
        archived: false,
        net: 84000,
        reasons: ['ingredient_without_cost'],
        ingredients: ['Sirup Vanila'],
      },
      {
        item_id: id['tehTarik'],
        name: 'Teh Tarik',
        archived: false,
        net: 24000,
        reasons: ['no_recipe', 'sold_without_cost'],
        ingredients: [],
      },
    ])
  })

  it('shows no quadrants when costs cover less than half of a category’s sales', async () => {
    const m = await matrix(`${RANGE}&category_id=${cat['Minuman Lain'] ?? ''}`)
    expect(m).toMatchObject({ state: 'incomplete_costs', coverage_bps: 1667 })
    expect(m['items']).toEqual([expect.objectContaining({ name: 'Air Mineral', quadrant: null })])
    expect(m['incomplete']).toEqual([
      expect.objectContaining({ name: 'Teh Manis', reasons: ['no_recipe', 'sold_without_cost'] }),
    ])
  })

  it('needs 3 cost-complete items', async () => {
    const m = await matrix(`${RANGE}&category_id=${cat['Makanan'] ?? ''}`)
    expect(m).toMatchObject({ state: 'too_few_items', coverage_bps: 10000 })
    expect(m['items']).toEqual([expect.objectContaining({ name: 'Croissant', quadrant: null })])
  })

  it('reports no_sales for a range without orders', async () => {
    const m = await matrix('from=2026-10-01&to=2026-10-31')
    expect(m).toMatchObject({
      category_id: null,
      categories: [],
      state: 'no_sales',
      items: [],
      incomplete: [],
    })
  })

  it('answers 404 for an unknown category and 400 for a range over 92 days', async () => {
    const missing = expectStatus(await get(`${RANGE}&category_id=${randomUUID()}`), 404)
    expect(missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
    expectStatus(await get('from=2026-08-01&to=2026-11-30'), 400)
  })

  it('is owner only (it shows costs)', async () => {
    expectStatus(await get(RANGE, s.as.manager), 403)
    expectStatus(await get(RANGE, s.as.cashier), 403)
  })
})
