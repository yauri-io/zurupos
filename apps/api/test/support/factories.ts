import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import type { Row } from './pg.js'

// Every tenant table, in insert (dependency) order. The catalog test fails if a
// table with RLS is missing here, so a new table cannot escape the isolation suite.
export const TENANT_TABLES = [
  'tenants',
  'users',
  'devices',
  'sessions',
  'pin_attempts',
  'password_resets',
  'categories',
  'items',
  'modifier_groups',
  'modifier_options',
  'item_modifier_groups',
  'ingredients',
  'recipe_lines',
  'modifier_option_effects',
  'discounts',
  'order_counters',
  'orders',
  'order_lines',
  'order_line_modifiers',
  'payments',
  'stock_movements',
  'audit_log',
  'report_email_runs',
] as const

export type TenantTable = (typeof TENANT_TABLES)[number]

// Tables without an `id` column; rows are addressed by tenant_id only.
export const TABLES_WITHOUT_ID: readonly TenantTable[] = ['item_modifier_groups', 'order_counters']

// D-015: the only tables zuru_app may DELETE from.
export const DELETABLE_TABLES: readonly TenantTable[] = [
  'item_modifier_groups',
  'recipe_lines',
  'modifier_option_effects',
]

// One existing row id per table for a tenant (the parents a new row may reference).
export type Refs = { tenant: string; marker: string } & Partial<Record<TenantTable, string>>

const ref = (refs: Refs, table: TenantTable): string => {
  const id = refs[table]
  if (!id) throw new Error(`factory needs a ${table} row first`)
  return id
}

const token = () => randomBytes(32)
const future = () => new Date(Date.now() + 3_600_000)

// Each factory returns a fully valid row for `refs.tenant`, so an insert can only
// fail because of RLS (D-023). Marker strings let API tests spot leaked data.
export const FACTORIES: Record<TenantTable, (refs: Refs) => Row> = {
  tenants: (r) => ({ id: r.tenant, name: `${r.marker} shop` }),
  users: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    name: `${r.marker} cashier`,
    role: 'cashier',
    pin_hash: 'not-a-real-hash',
  }),
  devices: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    name: `${r.marker} device`,
    token_hash: token(),
    paired_by_user_id: ref(r, 'users'),
  }),
  sessions: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    user_id: ref(r, 'users'),
    kind: 'staff',
    device_id: ref(r, 'devices'),
    token_hash: token(),
    expires_at: future(),
  }),
  pin_attempts: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    user_id: ref(r, 'users'),
    device_id: ref(r, 'devices'),
  }),
  password_resets: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    user_id: ref(r, 'users'),
    token_hash: token(),
    purpose: 'reset',
    expires_at: future(),
  }),
  categories: (r) => ({ id: randomUUID(), tenant_id: r.tenant, name: `${r.marker} category` }),
  items: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    category_id: ref(r, 'categories'),
    name: `${r.marker} item`,
    price: 25000n,
  }),
  modifier_groups: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    name: `${r.marker} group`,
    selection: 'single',
    min_select: 0,
    max_select: 1,
  }),
  modifier_options: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    group_id: ref(r, 'modifier_groups'),
    name: `${r.marker} option`,
    price_delta: 5000n,
  }),
  item_modifier_groups: (r) => ({
    tenant_id: r.tenant,
    item_id: ref(r, 'items'),
    group_id: ref(r, 'modifier_groups'),
  }),
  ingredients: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    name: `${r.marker} ingredient ${randomUUID().slice(0, 8)}`,
    base_unit: 'ml',
    stock_qty: '1000.000',
  }),
  recipe_lines: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    item_id: ref(r, 'items'),
    ingredient_id: ref(r, 'ingredients'),
    qty: '150.000',
  }),
  modifier_option_effects: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    option_id: ref(r, 'modifier_options'),
    effect: 'add',
    ingredient_id: ref(r, 'ingredients'),
    qty: '18.000',
  }),
  discounts: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    name: `${r.marker} discount`,
    kind: 'percent',
    value: 1000n,
    scope: 'order',
  }),
  order_counters: (r) => ({
    tenant_id: r.tenant,
    business_date: `2026-${String(randomInt(1, 13)).padStart(2, '0')}-${String(randomInt(1, 29)).padStart(2, '0')}`,
    last_number: 1,
  }),
  orders: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    client_order_id: randomUUID(),
    order_number: randomInt(1, 1_000_000),
    business_date: '2026-11-17',
    status: 'paid',
    order_type: 'takeaway',
    customer_name: `${r.marker} customer`,
    subtotal: 25000n,
    net_sales: 25000n,
    total: 25000n,
    paid_total: 25000n,
    created_by_user_id: ref(r, 'users'),
    device_id: ref(r, 'devices'),
  }),
  order_lines: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    order_id: ref(r, 'orders'),
    line_no: randomInt(1, 1_000_000),
    item_id: ref(r, 'items'),
    item_name: `${r.marker} item`,
    category_name: `${r.marker} category`,
    unit_price: 25000n,
    qty: 1,
    line_gross: 25000n,
    line_net: 25000n,
  }),
  order_line_modifiers: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    order_line_id: ref(r, 'order_lines'),
    option_id: ref(r, 'modifier_options'),
    group_name: `${r.marker} group`,
    option_name: `${r.marker} option`,
    price_delta: 0n,
  }),
  payments: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    order_id: ref(r, 'orders'),
    seq: randomInt(1, 1_000_000),
    method: 'qris',
    amount: 25000n,
    reference: r.marker,
  }),
  stock_movements: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    ingredient_id: ref(r, 'ingredients'),
    type: 'stock_in',
    qty_delta: '1000.000',
    unit_cost: '20.0000',
    total_cost: 20000n,
    balance_after: '1000.000',
    created_by_user_id: ref(r, 'users'),
  }),
  audit_log: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    actor_user_id: ref(r, 'users'),
    action: 'test.seed',
    entity_type: 'test',
    data: { marker: r.marker },
  }),
  report_email_runs: (r) => ({
    id: randomUUID(),
    tenant_id: r.tenant,
    kind: 'daily_summary',
    period_start: '2026-11-01',
  }),
}

// Primary-key column(s) of the row a factory produced, for addressing it later.
export const rowKey = (table: TenantTable, row: Row): string =>
  TABLES_WITHOUT_ID.includes(table) ? String(row['tenant_id']) : String(row['id'])
