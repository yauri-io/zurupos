import type { Tx } from '../../db/with-tenant.js'

const GROUP_COLUMNS = ['id', 'name', 'selection', 'min_select', 'max_select', 'sort'] as const
const OPTION_COLUMNS = ['id', 'group_id', 'name', 'price_delta', 'is_default', 'sort', 'is_active'] as const

export type GroupRow = {
  id: string
  name: string
  selection: string
  min_select: number
  max_select: number
  sort: number
}
export type OptionRow = {
  id: string
  group_id: string
  name: string
  price_delta: bigint
  is_default: boolean
  sort: number
  is_active: boolean
}

export const listGroups = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('modifier_groups')
    .select(GROUP_COLUMNS)
    .where('tenant_id', '=', tenantId)
    .where('archived_at', 'is', null)
    .orderBy('sort')
    .orderBy('name')
    .execute()

export const listOptions = (trx: Tx, tenantId: string, groupIds: readonly string[]) =>
  groupIds.length === 0
    ? Promise.resolve([])
    : trx
        .selectFrom('modifier_options')
        .select(OPTION_COLUMNS)
        .where('tenant_id', '=', tenantId)
        .where('group_id', 'in', groupIds)
        .where('archived_at', 'is', null)
        .orderBy('sort')
        .orderBy('name')
        .execute()

// Locks the group: option changes that depend on its rules (defaults) serialise on it.
export const findGroupForUpdate = (trx: Tx, tenantId: string, id: string) =>
  trx
    .selectFrom('modifier_groups')
    .select(GROUP_COLUMNS)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .where('archived_at', 'is', null)
    .forUpdate()
    .executeTakeFirst()

export const insertGroup = (
  trx: Tx,
  row: {
    tenant_id: string
    name: string
    selection: string
    min_select: number
    max_select: number
    sort?: number
  },
) => trx.insertInto('modifier_groups').values(row).returning(GROUP_COLUMNS).executeTakeFirstOrThrow()

export const updateGroup = (
  trx: Tx,
  tenantId: string,
  id: string,
  patch: Partial<Omit<GroupRow, 'id'>> & { archived_at?: Date },
) =>
  trx
    .updateTable('modifier_groups')
    .set(patch)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .returning(GROUP_COLUMNS)
    .executeTakeFirstOrThrow()

export const detachGroupFromItems = (trx: Tx, tenantId: string, groupId: string) =>
  trx
    .deleteFrom('item_modifier_groups')
    .where('tenant_id', '=', tenantId)
    .where('group_id', '=', groupId)
    .execute()

export const findOption = (trx: Tx, tenantId: string, id: string) =>
  trx
    .selectFrom('modifier_options as o')
    .innerJoin('modifier_groups as g', (j) =>
      j.onRef('g.tenant_id', '=', 'o.tenant_id').onRef('g.id', '=', 'o.group_id'),
    )
    .select(['o.id', 'o.group_id'])
    .where('o.tenant_id', '=', tenantId)
    .where('o.id', '=', id)
    .where('o.archived_at', 'is', null)
    .where('g.archived_at', 'is', null)
    .executeTakeFirst()

export const insertOption = (
  trx: Tx,
  row: {
    tenant_id: string
    group_id: string
    name: string
    price_delta?: bigint
    is_default?: boolean
    sort?: number
    is_active?: boolean
  },
) => trx.insertInto('modifier_options').values(row).returning(OPTION_COLUMNS).executeTakeFirstOrThrow()

export const updateOption = (
  trx: Tx,
  tenantId: string,
  id: string,
  patch: Partial<Omit<OptionRow, 'id' | 'group_id'>> & { archived_at?: Date },
) =>
  trx
    .updateTable('modifier_options')
    .set(patch)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .returning(OPTION_COLUMNS)
    .executeTakeFirstOrThrow()

export const clearOtherDefaults = (trx: Tx, tenantId: string, groupId: string, keepId: string) =>
  trx
    .updateTable('modifier_options')
    .set({ is_default: false })
    .where('tenant_id', '=', tenantId)
    .where('group_id', '=', groupId)
    .where('id', '<>', keepId)
    .where('is_default', '=', true)
    .execute()
