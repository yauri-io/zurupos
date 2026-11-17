import type { Tx } from '../../db/with-tenant.js'

// Everything the POS grid can show: active, non-archived categories and items
// (sold-out items included, so they can be greyed out).
export const categories = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('categories')
    .select(['id', 'name', 'sort'])
    .where('tenant_id', '=', tenantId)
    .where('is_active', '=', true)
    .where('archived_at', 'is', null)
    .orderBy('sort')
    .orderBy('name')
    .orderBy('id')
    .execute()

export const items = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('items as i')
    .innerJoin('categories as c', (j) =>
      j.onRef('c.tenant_id', '=', 'i.tenant_id').onRef('c.id', '=', 'i.category_id'),
    )
    .select(['i.id', 'i.category_id', 'i.name', 'i.price', 'i.color', 'i.sort', 'i.is_available'])
    .where('i.tenant_id', '=', tenantId)
    .where('i.is_active', '=', true)
    .where('i.archived_at', 'is', null)
    .where('c.is_active', '=', true)
    .where('c.archived_at', 'is', null)
    .orderBy('i.sort')
    .orderBy('i.name')
    .orderBy('i.id')
    .execute()

// Item → group links in modifier-sheet order (D-033).
export const itemGroups = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('item_modifier_groups as l')
    .innerJoin('modifier_groups as g', (j) =>
      j.onRef('g.tenant_id', '=', 'l.tenant_id').onRef('g.id', '=', 'l.group_id'),
    )
    .select(['l.item_id', 'l.group_id'])
    .where('l.tenant_id', '=', tenantId)
    .where('g.archived_at', 'is', null)
    .orderBy('l.item_id')
    .orderBy('l.sort')
    .orderBy('g.sort')
    .orderBy('g.id')
    .execute()

export const groups = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('modifier_groups')
    .select(['id', 'name', 'selection', 'min_select', 'max_select'])
    .where('tenant_id', '=', tenantId)
    .where('archived_at', 'is', null)
    .orderBy('sort')
    .orderBy('id')
    .execute()

export const options = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('modifier_options')
    .select(['id', 'group_id', 'name', 'price_delta', 'is_default'])
    .where('tenant_id', '=', tenantId)
    .where('is_active', '=', true)
    .where('archived_at', 'is', null)
    .orderBy('sort')
    .orderBy('id')
    .execute()

export const discounts = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('discounts')
    .select(['id', 'name', 'kind', 'value', 'scope'])
    .where('tenant_id', '=', tenantId)
    .where('is_active', '=', true)
    .where('archived_at', 'is', null)
    .orderBy('scope')
    .orderBy('name')
    .orderBy('id')
    .execute()
