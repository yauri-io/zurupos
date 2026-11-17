import type { AuthContext } from '../../auth/context.js'
import type { Tx } from '../../db/with-tenant.js'
import { apiError } from '../../http/errors.js'
import * as q from './queries.js'

const load = async (trx: Tx, auth: AuthContext, id: string) => {
  const row = await q.findCategoryForUpdate(trx, auth.tenantId, id)
  if (!row) throw apiError('NOT_FOUND')
  return row
}

export const listCategories = async (trx: Tx, auth: AuthContext) => ({
  categories: await q.listCategories(trx, auth.tenantId),
})

export const createCategory = (
  trx: Tx,
  auth: AuthContext,
  input: { name: string; sort?: number; is_active?: boolean },
) => q.insertCategory(trx, { tenant_id: auth.tenantId, ...input })

export const updateCategory = async (
  trx: Tx,
  auth: AuthContext,
  id: string,
  patch: { name?: string; sort?: number; is_active?: boolean },
) => {
  const current = await load(trx, auth, id)
  return Object.keys(patch).length > 0 ? q.updateCategory(trx, auth.tenantId, id, patch) : current
}

// D-029: archive only; a category that still holds items can't be archived.
export const archiveCategory = async (trx: Tx, auth: AuthContext, id: string) => {
  await load(trx, auth, id)
  if ((await q.countLiveItems(trx, auth.tenantId, id)) > 0) {
    throw apiError('CONFLICT', { reason: 'category_has_items' })
  }
  await q.updateCategory(trx, auth.tenantId, id, { archived_at: new Date() })
}
