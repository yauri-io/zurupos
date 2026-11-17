import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from '../support/app.js'
import { api, createIngredient } from '../support/menu.js'
import { appPool, inTx, insertRow } from '../support/pg.js'
import { roleShop, type RoleShop } from '../support/roles.js'

let t: TestApp
let shop: RoleShop
const pool = appPool(1)

beforeAll(async () => {
  t = await createTestApp()
  shop = await roleShop(t.app, 'ingredients')
})
afterAll(async () => {
  await t.close()
  await pool.end()
})

type Ingredient = Record<string, unknown> & { id: string }

describe('ingredients', () => {
  it('creates with zero stock and cost; quantities are decimal strings', async () => {
    const res = await api(t.app, shop.as.manager, 'POST', '/v1/ingredients', {
      name: 'Susu Segar',
      base_unit: 'ml',
      low_stock_threshold: '2000',
      purchase_unit_name: 'Karton',
      purchase_unit_size: '12000',
    })
    expect(res.statusCode, res.body).toBe(201)
    const { id, ...rest } = res.json<Ingredient>()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(rest).toEqual({
      name: 'Susu Segar',
      base_unit: 'ml',
      stock_qty: '0',
      low_stock_threshold: '2000',
      purchase_unit_name: 'Karton',
      purchase_unit_size: '12000',
      // Stock 0 ≤ threshold 2000.
      is_low: true,
      archived: false,
    })
  })

  it('avg_cost is in the owner’s response only (SPEC §5.5)', async () => {
    const ing = await createIngredient(t.app, shop.as.owner, 'Biji Kopi', 'g')
    const owner = (await api(t.app, shop.as.owner, 'GET', `/v1/ingredients/${ing.id}`)).json<Ingredient>()
    expect(owner.avg_cost).toBe('0')
    for (const role of ['manager', 'cashier', 'employee'] as const) {
      const res = await api(t.app, shop.as[role], 'GET', `/v1/ingredients/${ing.id}`)
      expect(res.statusCode).toBe(200)
      expect(res.json()).not.toHaveProperty('avg_cost')
      const list = await api(t.app, shop.as[role], 'GET', '/v1/ingredients')
      expect(list.body).not.toContain('avg_cost')
    }
  })

  it('cashier and employee can view stock but not edit ingredients', async () => {
    for (const role of ['cashier', 'employee'] as const) {
      expect(
        (await api(t.app, shop.as[role], 'POST', '/v1/ingredients', { name: 'X', base_unit: 'g' }))
          .statusCode,
      ).toBe(403)
    }
  })

  it.each([
    [{ base_unit: 'kg' }],
    [{ low_stock_threshold: '-1' }],
    [{ low_stock_threshold: '1.2345' }],
    [{ low_stock_threshold: 5 }],
    [{ purchase_unit_name: 'Karton' }],
    [{ purchase_unit_size: '12' }],
    [{ purchase_unit_name: 'Karton', purchase_unit_size: '0' }],
    [{ stock_qty: '100' }],
    [{ avg_cost: '10' }],
  ])('rejects %o', async (body) => {
    const res = await api(t.app, shop.as.owner, 'POST', '/v1/ingredients', {
      name: `Bad ${randomUUID().slice(0, 6)}`,
      base_unit: 'g',
      ...body,
    })
    expect(res.statusCode, res.body).toBe(400)
  })

  it('names are unique per shop among live ingredients (case-insensitive)', async () => {
    const first = await createIngredient(t.app, shop.as.owner, 'Gula Aren', 'ml')
    const dup = await api(t.app, shop.as.owner, 'POST', '/v1/ingredients', {
      name: 'gula aren',
      base_unit: 'ml',
    })
    expect(dup.statusCode).toBe(409)
    await api(t.app, shop.as.owner, 'DELETE', `/v1/ingredients/${first.id}`)
    expect(
      (await api(t.app, shop.as.owner, 'POST', '/v1/ingredients', { name: 'Gula Aren', base_unit: 'ml' }))
        .statusCode,
    ).toBe(201)
  })

  it('PATCH edits threshold and purchase unit, but never stock, cost or unit', async () => {
    const ing = await createIngredient(t.app, shop.as.owner, 'Oat Milk', 'ml')
    const ok = await api(t.app, shop.as.owner, 'PATCH', `/v1/ingredients/${ing.id}`, {
      low_stock_threshold: '1000.5',
      purchase_unit_name: 'Botol',
      purchase_unit_size: '1000',
    })
    expect(ok.json()).toMatchObject({ low_stock_threshold: '1000.5', purchase_unit_name: 'Botol' })
    const clear = await api(t.app, shop.as.owner, 'PATCH', `/v1/ingredients/${ing.id}`, {
      purchase_unit_name: null,
      purchase_unit_size: null,
    })
    expect(clear.json()).toMatchObject({ purchase_unit_name: null, purchase_unit_size: null })
    for (const body of [
      { base_unit: 'g' },
      { stock_qty: '5' },
      { avg_cost: '1' },
      { purchase_unit_size: '10' },
    ]) {
      expect((await api(t.app, shop.as.owner, 'PATCH', `/v1/ingredients/${ing.id}`, body)).statusCode).toBe(
        400,
      )
    }
  })

  it('archived ingredients leave the list but stay readable', async () => {
    const ing = await createIngredient(t.app, shop.as.owner, 'Sirup Karamel', 'ml')
    await api(t.app, shop.as.owner, 'DELETE', `/v1/ingredients/${ing.id}`)
    expect((await api(t.app, shop.as.owner, 'GET', '/v1/ingredients')).body).not.toContain(ing.id)
    expect((await api(t.app, shop.as.owner, 'GET', `/v1/ingredients/${ing.id}`)).json()).toMatchObject({
      archived: true,
    })
    expect(
      (await api(t.app, shop.as.owner, 'PATCH', `/v1/ingredients/${ing.id}`, { name: 'X' })).statusCode,
    ).toBe(404)
  })
})

describe('GET /ingredients/:id/movements', () => {
  it('pages newest first with a cursor and hides costs from non-owners', async () => {
    const ing = await createIngredient(t.app, shop.as.owner, 'Es Batu', 'g')
    // Movements arrive with M3's stock operations; insert some directly to test the read path.
    await inTx(pool, shop.tenantId, async (c) => {
      for (let i = 1; i <= 5; i++) {
        await insertRow(c, 'stock_movements', {
          tenant_id: shop.tenantId,
          ingredient_id: ing.id,
          type: 'stock_in',
          qty_delta: `${i}.000`,
          unit_cost: '12.5000',
          total_cost: BigInt(i * 12) + 1n,
          balance_after: `${(i * (i + 1)) / 2}.000`,
          created_by_user_id: shop.owner.id,
        })
      }
    })
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const url: string = `/v1/ingredients/${ing.id}/movements?limit=2${cursor ? `&cursor=${cursor}` : ''}`
      const raw = await api(t.app, shop.as.owner, 'GET', url)
      expect(raw.statusCode, raw.body).toBe(200)
      const page = raw.json<{
        movements: { qty_delta: string; unit_cost?: string; created_by: { name: string } }[]
        next_cursor: string | null
      }>()
      seen.push(...page.movements.map((m) => m.qty_delta))
      expect(page.movements[0]?.unit_cost).toBe('12.5')
      cursor = page.next_cursor
      pages++
    } while (cursor && pages < 10)
    // All five, each once, newest (largest i, all in one transaction → id tiebreak) first.
    expect([...seen].sort()).toEqual(['1', '2', '3', '4', '5'])
    expect(pages).toBe(3)

    const asEmployee = await api(t.app, shop.as.employee, 'GET', `/v1/ingredients/${ing.id}/movements`)
    expect(asEmployee.statusCode).toBe(200)
    expect(asEmployee.body).not.toContain('unit_cost')
    expect(asEmployee.body).not.toContain('total_cost')
  })

  it('rejects a malformed cursor', async () => {
    const ing = await createIngredient(t.app, shop.as.owner, 'Sedotan', 'pcs')
    const res = await api(t.app, shop.as.owner, 'GET', `/v1/ingredients/${ing.id}/movements?cursor=bm9wZQ`)
    expect(res.statusCode).toBe(400)
  })
})
