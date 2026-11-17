// Demo shop "Kopi Demo" for local development (SPEC §13, D-046). Dev database only.
//
//   pnpm db:seed            (needs: docker compose up, pnpm db:migrate, SIGNUP_ENABLED=true)
//
// Everything is created through the API in-process, so prices, totals, COGS and
// stock movements are exactly what real orders produce. Afterwards the orders are
// spread over the last 14 days (paid_at, business_date, per-day numbering) with
// the migration role, which is the only part that bypasses the API.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'
import { createDb } from '../src/db/kysely.js'
import { priceOrder } from '../src/domain/pricing.js'
import { createLimiters } from '../src/http/rate-limit.js'

const OWNER = { email: 'owner@demo.zurupos.local', password: 'demo-kopi-2026', pin: '2580', name: 'Dina' }
const MANAGER = { email: 'manager@demo.zurupos.local', password: 'demo-kopi-2026', pin: '3691', name: 'Rina' }
const CASHIER = { name: 'Budi', pin: '4826' }
const EMPLOYEE = { name: 'Sari', pin: '7319' }
const DAYS = 14
const TIMEZONE = 'Asia/Jakarta'

type Json = Record<string, unknown>

const env = (name: string) => {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set (see .env.example)`)
  return v
}

// Deterministic so every developer gets the same shop.
let state = 20261128
const rand = () => {
  state = (state * 1103515245 + 12345) % 2 ** 31
  return state / 2 ** 31
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T
const chance = (p: number) => rand() < p

const main = async () => {
  // Request logs would drown the summary.
  const config = loadConfig({ ...process.env, LOG_LEVEL: 'warn' })
  if (!config.signupEnabled) throw new Error('Set SIGNUP_ENABLED=true in .env to seed')
  const db = createDb(config.databaseUrl, 4)
  const app = await buildApp({ config, db, limiters: createLimiters(10_000) })
  const browser = { 'x-requested-with': 'zuru', origin: config.dashboardOrigin }

  let cookie = ''
  const call = async (method: string, url: string, payload?: unknown, headers: Json = {}) => {
    const res = await app.inject({
      method: method as 'GET',
      url,
      headers: { ...browser, ...(cookie ? { cookie } : {}), ...headers } as Record<string, string>,
      ...(payload === undefined ? {} : { payload: payload as Json }),
    })
    if (res.statusCode >= 300) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`)
    return res.body ? res.json<Json>() : {}
  }
  const id = async (url: string, body: Json) => (await call('POST', url, body))['id'] as string

  // Shop and owner.
  const signup = await app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    headers: browser,
    payload: {
      shop_name: 'Kopi Demo',
      name: OWNER.name,
      email: OWNER.email,
      password: OWNER.password,
      pin: OWNER.pin,
    },
  })
  if (signup.statusCode === 409) {
    throw new Error('The demo shop already exists. Start from an empty database: docker compose down -v')
  }
  if (signup.statusCode !== 201) throw new Error(`signup → ${signup.statusCode} ${signup.body}`)
  cookie = String(signup.headers['set-cookie']).split(';')[0] ?? ''
  const me = await call('GET', '/v1/auth/me')
  const tenantId = (me['tenant'] as Json)['id'] as string

  // PB1 10% and service 5% configured but off (SPEC §13).
  await call('PATCH', '/v1/settings', {
    address: 'Jl. Braga No. 12, Bandung',
    phone: '0812-0000-0000',
    receipt_footer: 'Terima kasih! Sampai jumpa lagi.',
    tax_bps: 1000,
    service_charge_bps: 500,
  })

  // Staff. The manager accepts the invite from the outbox so they can sign in.
  await id('/v1/users', { name: MANAGER.name, role: 'manager', pin: MANAGER.pin, email: MANAGER.email })
  const worker = new pg.Pool({ connectionString: env('WORKER_DATABASE_URL'), max: 1 })
  const mail = await worker.query<{ text: string }>(
    `select text from outbox where $1 = any (to_addresses) order by created_at desc limit 1`,
    [MANAGER.email],
  )
  await worker.end()
  const token = /\/invite\/([A-Za-z0-9_-]{43})/.exec(mail.rows[0]?.text ?? '')?.[1]
  if (!token) throw new Error('manager invite not found in the outbox')
  await call('POST', '/v1/auth/invite/accept', { token, password: MANAGER.password })
  const cashierId = await id('/v1/users', { name: CASHIER.name, role: 'cashier', pin: CASHIER.pin })
  await id('/v1/users', { name: EMPLOYEE.name, role: 'employee', pin: EMPLOYEE.pin })

  // Ingredients with purchase units, and opening stock at realistic prices.
  const ingredients: [string, string, string, string | null, string | null, string, number][] = [
    // name, unit, threshold, purchase unit, size, stock-in qty (purchase units), total cost
    ['Biji Kopi Espresso', 'g', '1000', 'Bag 1 kg', '1000', '6', 1_500_000],
    ['Susu Segar', 'ml', '3000', 'Karton 1 L', '1000', '30', 600_000],
    ['Susu Oat', 'ml', '2000', 'Karton 1 L', '1000', '12', 480_000],
    ['Sirup Gula Aren', 'ml', '1000', 'Botol 1 L', '1000', '5', 250_000],
    ['Sirup Vanila', 'ml', '300', 'Botol 750 ml', '750', '2', 260_000],
    ['Sirup Karamel', 'ml', '300', 'Botol 750 ml', '750', '2', 260_000],
    ['Bubuk Matcha', 'g', '200', 'Pack 500 g', '500', '2', 400_000],
    ['Bubuk Cokelat', 'g', '300', 'Pack 1 kg', '1000', '1', 180_000],
    ['Es Batu', 'g', '5000', 'Karung 10 kg', '10000', '6', 120_000],
    ['Cup 12oz', 'pcs', '50', 'Slop 50', '50', '10', 300_000],
    ['Cup 16oz', 'pcs', '50', 'Slop 50', '50', '8', 280_000],
    ['Tutup Cup', 'pcs', '50', 'Slop 100', '100', '8', 160_000],
    ['Sedotan', 'pcs', '50', 'Pack 100', '100', '5', 50_000],
    ['Air Mineral 600 ml', 'pcs', '12', 'Dus 24', '24', '3', 108_000],
    ['Croissant', 'pcs', '5', null, null, '60', 540_000],
  ]
  const ing: Record<string, string> = {}
  for (const [name, unit, threshold, pu, size, qty, cost] of ingredients) {
    ing[name] = await id('/v1/ingredients', {
      name,
      base_unit: unit,
      low_stock_threshold: threshold,
      purchase_unit_name: pu,
      purchase_unit_size: size,
    })
    await call('POST', '/v1/stock/in', {
      ingredient_id: ing[name],
      ...(pu ? { purchase_qty: qty } : { qty }),
      total_cost: cost,
    })
  }

  // Menu.
  const cats = {
    kopi: await id('/v1/categories', { name: 'Kopi', sort: 0 }),
    nonKopi: await id('/v1/categories', { name: 'Non-Kopi', sort: 1 }),
    makanan: await id('/v1/categories', { name: 'Makanan', sort: 2 }),
  }
  const r = (name: string, qty: string) => ({ ingredient_id: ing[name], qty })
  const cupLidStraw = [r('Cup 12oz', '1'), r('Tutup Cup', '1'), r('Sedotan', '1'), r('Es Batu', '150')]
  const menu: [
    string,
    keyof typeof cats,
    number,
    string,
    { ingredient_id: string | undefined; qty: string }[],
    boolean,
  ][] = [
    // name, category, price, colour, recipe, drink (gets modifier groups)
    ['Americano', 'kopi', 18000, 'brown', [r('Biji Kopi Espresso', '18'), ...cupLidStraw], true],
    [
      'Kopi Susu Gula Aren',
      'kopi',
      25000,
      'amber',
      [r('Biji Kopi Espresso', '18'), r('Susu Segar', '150'), r('Sirup Gula Aren', '20'), ...cupLidStraw],
      true,
    ],
    [
      'Latte',
      'kopi',
      28000,
      'orange',
      [r('Biji Kopi Espresso', '18'), r('Susu Segar', '200'), ...cupLidStraw],
      true,
    ],
    [
      'Cappuccino',
      'kopi',
      28000,
      'yellow',
      [r('Biji Kopi Espresso', '18'), r('Susu Segar', '150'), ...cupLidStraw],
      true,
    ],
    [
      'Matcha Latte',
      'nonKopi',
      30000,
      'green',
      [r('Bubuk Matcha', '10'), r('Susu Segar', '200'), ...cupLidStraw],
      true,
    ],
    [
      'Chocolate',
      'nonKopi',
      27000,
      'brown',
      [r('Bubuk Cokelat', '25'), r('Susu Segar', '200'), ...cupLidStraw],
      true,
    ],
    ['Air Mineral', 'nonKopi', 8000, 'sky', [r('Air Mineral 600 ml', '1')], false],
    ['Croissant', 'makanan', 22000, 'orange', [r('Croissant', '1')], false],
    ['Croissant Cokelat', 'makanan', 26000, 'red', [r('Croissant', '1'), r('Bubuk Cokelat', '10')], false],
    ['Es Kopi Hitam', 'kopi', 15000, 'neutral', [r('Biji Kopi Espresso', '18'), ...cupLidStraw], true],
  ]
  const items: { id: string; price: number; drink: boolean; milk: boolean }[] = []
  for (const [i, [name, cat, price, color, recipe, drink]] of menu.entries()) {
    const itemId = await id('/v1/items', { category_id: cats[cat], name, price, color, sort: i })
    await call('PUT', `/v1/items/${itemId}/recipe`, { lines: recipe })
    items.push({ id: itemId, price, drink, milk: recipe.some((l) => l.ingredient_id === ing['Susu Segar']) })
  }

  // Modifier groups with the §7.1 effects.
  const group = (name: string, extra: Json) =>
    id('/v1/modifier-groups', { name, selection: 'single', ...extra })
  const option = (groupId: string, name: string, extra: Json = {}) =>
    id('/v1/modifier-options', { group_id: groupId, name, ...extra })
  const effects = (optionId: string, list: Json[]) =>
    call('PUT', `/v1/modifier-options/${optionId}/effects`, { effects: list })
  const g = {
    size: await group('Ukuran', { min_select: 1, sort: 0 }),
    sugar: await group('Gula', { min_select: 1, sort: 1 }),
    ice: await group('Es', { min_select: 1, sort: 2 }),
    milk: await group('Susu', { min_select: 1, sort: 3 }),
    extra: await group('Tambahan', { selection: 'multiple', max_select: 3, sort: 4 }),
  }
  const o = {
    regular: await option(g.size, 'Regular', { is_default: true }),
    large: await option(g.size, 'Large', { price_delta: 5000, sort: 1 }),
    normalSugar: await option(g.sugar, 'Normal', { is_default: true }),
    lessSugar: await option(g.sugar, 'Less sugar', { sort: 1 }),
    noSugar: await option(g.sugar, 'Tanpa gula', { sort: 2 }),
    normalIce: await option(g.ice, 'Es normal', { is_default: true }),
    lessIce: await option(g.ice, 'Sedikit es', { sort: 1 }),
    fresh: await option(g.milk, 'Susu segar', { is_default: true }),
    oat: await option(g.milk, 'Oat milk', { price_delta: 6000, sort: 1 }),
    shot: await option(g.extra, 'Extra shot', { price_delta: 5000 }),
    vanilla: await option(g.extra, 'Sirup vanila', { price_delta: 4000, sort: 1 }),
    caramel: await option(g.extra, 'Sirup karamel', { price_delta: 4000, sort: 2 }),
  }
  await effects(o.large, [
    { effect: 'replace', target_ingredient_id: ing['Cup 12oz'], ingredient_id: ing['Cup 16oz'] },
    { effect: 'add', ingredient_id: ing['Susu Segar'], qty: '50' },
  ])
  await effects(o.lessSugar, [
    {
      effect: 'replace',
      target_ingredient_id: ing['Sirup Gula Aren'],
      ingredient_id: ing['Sirup Gula Aren'],
      qty: '10',
    },
  ])
  await effects(o.noSugar, [{ effect: 'remove', ingredient_id: ing['Sirup Gula Aren'] }])
  await effects(o.lessIce, [
    { effect: 'replace', target_ingredient_id: ing['Es Batu'], ingredient_id: ing['Es Batu'], qty: '75' },
  ])
  await effects(o.oat, [
    { effect: 'replace', target_ingredient_id: ing['Susu Segar'], ingredient_id: ing['Susu Oat'] },
  ])
  await effects(o.shot, [{ effect: 'add', ingredient_id: ing['Biji Kopi Espresso'], qty: '18' }])
  await effects(o.vanilla, [{ effect: 'add', ingredient_id: ing['Sirup Vanila'], qty: '15' }])
  await effects(o.caramel, [{ effect: 'add', ingredient_id: ing['Sirup Karamel'], qty: '15' }])
  for (const item of items.filter((i) => i.drink)) {
    const groups = item.milk ? [g.size, g.sugar, g.ice, g.milk, g.extra] : [g.size, g.sugar, g.ice, g.extra]
    await call('PUT', `/v1/items/${item.id}/modifier-groups`, { group_ids: groups })
  }
  const deltas: Record<string, number> = {
    [o.large]: 5000,
    [o.oat]: 6000,
    [o.shot]: 5000,
    [o.vanilla]: 4000,
    [o.caramel]: 4000,
  }
  const member = await id('/v1/discounts', {
    name: 'Diskon Member 10%',
    kind: 'percent',
    value: 1000,
    scope: 'item',
  })
  await id('/v1/discounts', { name: 'Promo Rp 5.000', kind: 'fixed', value: 5000, scope: 'order' })

  // A paired tablet with the cashier signed in.
  const pair = await call('POST', '/v1/devices/pair', {
    email: OWNER.email,
    password: OWNER.password,
    device_name: 'Kasir Depan',
  })
  const device = { 'x-device-token': pair['device_token'] as string }
  const session = await call('POST', '/v1/device/sessions', { user_id: cashierId, pin: CASHIER.pin }, device)
  const staff = { ...device, authorization: `Bearer ${session['staff_token'] as string}` }

  // ~200 orders: busy mornings and afternoons, more on weekends.
  const created: { id: string; day: number; minute: number }[] = []
  for (let day = DAYS - 1; day >= 0; day--) {
    const count = 11 + Math.floor(rand() * 6) + (day % 7 < 2 ? 4 : 0)
    for (let n = 0; n < count; n++) {
      const lines = Array.from({ length: chance(0.35) ? 2 : 1 }, () => {
        const item = pick(items)
        const options = item.drink
          ? [
              chance(0.3) ? o.large : o.regular,
              pick([o.normalSugar, o.normalSugar, o.lessSugar, o.noSugar]),
              chance(0.2) ? o.lessIce : o.normalIce,
              ...(item.milk ? [chance(0.15) ? o.oat : o.fresh] : []),
              ...(chance(0.15) ? [o.shot] : []),
              ...(chance(0.1) ? [pick([o.vanilla, o.caramel])] : []),
            ]
          : []
        return {
          item_id: item.id,
          qty: chance(0.2) ? 2 : 1,
          option_ids: options,
          ...(chance(0.08) ? { discount: { discount_id: member } } : {}),
        }
      })
      // Tax and service are off in the demo, so the total is the §6 price of the lines.
      const total = Number(
        priceOrder(
          lines.map((l) => ({
            unitPrice: BigInt(items.find((i) => i.id === l.item_id)?.price ?? 0),
            optionDeltas: l.option_ids.map((opt) => BigInt(deltas[opt] ?? 0)),
            qty: l.qty,
            discount: 'discount' in l ? { kind: 'percent' as const, value: 1000n } : null,
          })),
          null,
          {
            serviceChargeEnabled: false,
            serviceChargeBps: 0,
            taxEnabled: false,
            taxBps: 0,
            taxOnServiceCharge: false,
          },
        ).total,
      )
      const method = pick(['cash', 'cash', 'qris', 'qris', 'qris', 'debit'] as const)
      const tendered = Math.ceil(total / 10000) * 10000
      const order = await call(
        'POST',
        '/v1/orders',
        {
          client_order_id: randomUUID(),
          order_type: chance(0.4) ? 'dine_in' : 'takeaway',
          ...(chance(0.5)
            ? { customer_name: pick(['Andi', 'Bella', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hana']) }
            : {}),
          lines,
          payments: [
            method === 'cash'
              ? { method, amount: total, tendered }
              : {
                  method,
                  amount: total,
                  ...(method === 'qris' ? { provider: pick(['GoPay', 'OVO', 'DANA', 'ShopeePay']) } : {}),
                },
          ],
        },
        staff,
      )
      const hour = pick([7, 8, 8, 9, 9, 10, 11, 12, 13, 14, 15, 15, 16, 16, 17, 18, 19, 20])
      created.push({ id: order['id'] as string, day, minute: hour * 60 + Math.floor(rand() * 60) })
    }
  }
  // Two voids by the owner, one of them restocked.
  for (const [i, entry] of [created[5], created[created.length - 8]].entries()) {
    if (!entry) continue
    await call('POST', `/v1/orders/${entry.id}/void`, {
      reason: i === 0 ? 'Pelanggan batal' : 'Salah input menu',
      restock: i === 1,
    })
  }

  // Spread the orders over the last 14 days, numbered 1..n per day.
  const owner = new pg.Pool({ connectionString: env('MIGRATION_DATABASE_URL'), max: 1 })
  const client = await owner.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId])
    for (const c of created) {
      await client.query(
        `update orders set
           paid_at = ((now() at time zone $4)::date - $2::int + make_interval(mins => $3::int)) at time zone $4,
           business_date = (now() at time zone $4)::date - $2::int,
           order_number = order_number + 100000
         where id = $1`,
        [c.id, c.day, c.minute, TIMEZONE],
      )
    }
    await client.query(
      `update orders o set order_number = n.rn from (
         select id, row_number() over (partition by business_date order by paid_at) as rn from orders
       ) n where o.id = n.id`,
    )
    await client.query(
      `update stock_movements m set created_at = o.paid_at from orders o where m.order_id = o.id`,
    )
    // Opening stock arrived the day before the first sale.
    await client.query(
      `update stock_movements set created_at = now() - make_interval(days => $1::int) where order_id is null`,
      [DAYS],
    )
    await client.query(
      `update orders set voided_at = paid_at + interval '10 minutes' where status = 'voided'`,
    )
    await client.query(`delete from order_counters`)
    await client.query(
      `insert into order_counters (tenant_id, business_date, last_number)
       select tenant_id, business_date, max(order_number) from orders group by tenant_id, business_date`,
    )
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
    await owner.end()
  }

  await app.close()
  await db.destroy()
  console.log(`Kopi Demo: ${created.length} orders over ${DAYS} days.
  Dashboard  http://localhost:3000   owner ${OWNER.email} / ${OWNER.password}
                                     manager ${MANAGER.email} / ${MANAGER.password}
  App PINs   ${OWNER.name} ${OWNER.pin} · ${MANAGER.name} ${MANAGER.pin} · ${CASHIER.name} ${CASHIER.pin} · ${EMPLOYEE.name} ${EMPLOYEE.pin}`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
