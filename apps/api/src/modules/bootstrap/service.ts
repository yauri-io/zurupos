import { createHash } from 'node:crypto'
import type { AuthContext } from '../../auth/context.js'
import type { Tx } from '../../db/with-tenant.js'
import { money } from '../../http/serialize.js'
import { presentSettings } from '../settings/service.js'
import { findSettings } from '../settings/queries.js'
import * as q from './queries.js'

const groupBy = <T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> => {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return map
}

// D-040: the version is a hash of the payload itself, so any change the app would
// see (including removed links and archived rows) changes it, and nothing else does.
const versionOf = (payload: unknown): string =>
  createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32)

export const bootstrap = async (trx: Tx, auth: AuthContext) => {
  const t = auth.tenantId
  const [settings, categories, items, links, groups, options, discounts] = await Promise.all([
    findSettings(trx, t),
    q.categories(trx, t),
    q.items(trx, t),
    q.itemGroups(trx, t),
    q.groups(trx, t),
    q.options(trx, t),
    q.discounts(trx, t),
  ])
  const linksByItem = groupBy(links, (l) => l.item_id)
  const optionsByGroup = groupBy(options, (o) => o.group_id)
  const payload = {
    settings: presentSettings(settings, false),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    items: items.map((i) => ({
      id: i.id,
      category_id: i.category_id,
      name: i.name,
      price: money(i.price),
      color: i.color,
      is_available: i.is_available,
      modifier_group_ids: (linksByItem.get(i.id) ?? []).map((l) => l.group_id),
    })),
    modifier_groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      selection: g.selection as 'single' | 'multiple',
      min_select: g.min_select,
      max_select: g.max_select,
      options: (optionsByGroup.get(g.id) ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        price_delta: money(o.price_delta),
        is_default: o.is_default,
      })),
    })),
    discounts: discounts.map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind as 'percent' | 'fixed',
      value: money(d.value),
      scope: d.scope as 'item' | 'order',
    })),
  }
  return { menu_version: versionOf(payload), ...payload }
}
