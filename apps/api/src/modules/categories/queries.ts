import type { Tx } from '../../db/with-tenant.js'

const COLUMNS = ['id', 'name', 'sort', 'is_active'] as const

export const listCategories = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('categories')
    .select(COLUMNS)
    .where('tenant_id', '=', tenantId)
    .where('archived_at', 'is', null)
    .orderBy('sort')
    .orderBy('name')
    .execute()

export const findCategoryForUpdate = (trx: Tx, tenantId: string, id: string) =>
  trx
    .selectFrom('categories')
    .select(COLUMNS)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .where('archived_at', 'is', null)
    .forUpdate()
    .executeTakeFirst()

export const insertCategory = (
  trx: Tx,
  row: { tenant_id: string; name: string; sort?: number; is_active?: boolean },
) => trx.insertInto('categories').values(row).returning(COLUMNS).executeTakeFirstOrThrow()

export const updateCategory = (
  trx: Tx,
  tenantId: string,
  id: string,
  patch: { name?: string; sort?: number; is_active?: boolean; archived_at?: Date },
) =>
  trx
    .updateTable('categories')
    .set(patch)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .returning(COLUMNS)
    .executeTakeFirstOrThrow()

export const countLiveItems = async (trx: Tx, tenantId: string, categoryId: string) => {
  const row = await trx
    .selectFrom('items')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('tenant_id', '=', tenantId)
    .where('category_id', '=', categoryId)
    .where('archived_at', 'is', null)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}
