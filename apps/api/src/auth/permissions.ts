// The PRD §6 permission matrix, as the single source of truth (SPEC §5.5).
// Routes declare `permission`; one guard checks it. No inline role checks.

export const ROLES = ['owner', 'manager', 'cashier', 'employee'] as const
export type Role = (typeof ROLES)[number]

const O: Role = 'owner'
const M: Role = 'manager'
const C: Role = 'cashier'
const E: Role = 'employee'

export const PERMISSIONS = {
  'orders.create': [O, M, C],
  'discounts.apply_preset': [O, M, C],
  'discounts.apply_custom': [O, M],
  // Void directly. Cashiers may void only with an owner/manager PIN approval (SPEC §5.4).
  'orders.void': [O, M],
  'orders.void_with_approval': [C],
  'orders.view_today': [O, M, C, E],
  'orders.reprint_receipt': [O, M, C],
  'orders.view_all': [O],
  'stock.adjust': [O, M, E],
  'stock.view': [O, M, C, E],
  'menu.manage': [O, M],
  'menu.availability': [O, M, C],
  'reports.view': [O],
  'costs.view': [O],
  'users.manage': [O],
  'devices.pair': [O, M],
  'devices.manage': [O],
  'settings.manage': [O],
  'settings.view': [O, M, C, E],
  'dashboard.access': [O, M],
  'admin.stock_invariant': [O],
  // Online menu (PRD §6, F18–F19): per-item photo, show online and recommended
  // for owner and manager; the shop profile, photos, hours and publish for the owner.
  'online_menu.items': [O, M],
  'online_menu.manage': [O],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

export const can = (role: Role, permission: Permission): boolean =>
  (PERMISSIONS[permission] as readonly Role[]).includes(role)

export const permissionsFor = (role: Role): Permission[] =>
  (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p))

export const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value)
