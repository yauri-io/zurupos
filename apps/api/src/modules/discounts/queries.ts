import type { Tx } from '../../db/with-tenant.js'

const COLUMNS = ['id', 'name', 'kind', 'value', 'scope', 'is_active'] as const

export type DiscountRow = {
  id: string
  name: string
  kind: string
  value: bigint
  scope: string
  is_active: boolean
}

export const listDiscounts = (trx: Tx, tenantId: string) =>
  trx
    .selectFrom('discounts')
    .select(COLUMNS)
    .where('tenant_id', '=', tenantId)
    .where('archived_at', 'is', null)
    .orderBy('scope')
    .orderBy('name')
    .execute()

export const findDiscountForUpdate = (trx: Tx, tenantId: string, id: string) =>
  trx
    .selectFrom('discounts')
    .select(COLUMNS)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .where('archived_at', 'is', null)
    .forUpdate()
    .executeTakeFirst()

export const insertDiscount = (
  trx: Tx,
  row: { tenant_id: string; name: string; kind: string; value: bigint; scope: string; is_active?: boolean },
) => trx.insertInto('discounts').values(row).returning(COLUMNS).executeTakeFirstOrThrow()

export const updateDiscount = (
  trx: Tx,
  tenantId: string,
  id: string,
  patch: Partial<Omit<DiscountRow, 'id'>> & { archived_at?: Date },
) =>
  trx
    .updateTable('discounts')
    .set(patch)
    .where('tenant_id', '=', tenantId)
    .where('id', '=', id)
    .returning(COLUMNS)
    .executeTakeFirstOrThrow()
