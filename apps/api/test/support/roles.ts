import type pg from 'pg'
import type { App } from '../../src/http/types.js'
import {
  createManager,
  createUser,
  dashboardLogin,
  pairDevice,
  signupShop,
  staffLogin,
  type Creds,
  type Shop,
  type StaffUser,
} from './app.js'
import { inTx } from './pg.js'

export type RoleShop = Shop & {
  owner: Shop['owner']
  as: { owner: Creds; manager: Creds; cashier: Creds; employee: Creds; ownerStaff: Creds }
  users: { manager: StaffUser; cashier: StaffUser; employee: StaffUser }
}

// A shop with one user per role and the credentials each would really use.
export const roleShop = async (app: App, label: string): Promise<RoleShop> => {
  const shop = await signupShop(app, label)
  const manager = await createManager(app, shop)
  const cashier = await createUser(app, shop.ownerCookie, { name: 'Kasir', role: 'cashier', pin: '4826' })
  const employee = await createUser(app, shop.ownerCookie, { name: 'Barista', role: 'employee', pin: '7319' })
  const { device_token: deviceToken } = await pairDevice(app, shop.owner.email, shop.owner.password)
  const staff = async (id: string, pin: string): Promise<Creds> => ({
    kind: 'staff',
    deviceToken,
    staffToken: await staffLogin(app, deviceToken, id, pin),
  })
  return {
    ...shop,
    users: { manager, cashier, employee },
    as: {
      owner: { kind: 'dashboard', cookie: shop.ownerCookie },
      manager: {
        kind: 'dashboard',
        cookie: await dashboardLogin(app, manager.email ?? '', manager.password ?? ''),
      },
      cashier: await staff(cashier.id, cashier.pin),
      employee: await staff(employee.id, employee.pin),
      ownerStaff: await staff(shop.owner.id, shop.owner.pin),
    },
  }
}

export const auditActions = async (pool: pg.Pool, tenantId: string) =>
  inTx(pool, tenantId, async (c) => {
    const { rows } = await c.query<{
      action: string
      entity_id: string | null
      data: Record<string, unknown>
    }>('select action, entity_id, data from audit_log where tenant_id = $1 order by created_at, id', [
      tenantId,
    ])
    return rows
  })
