import type { AuthContext } from '../../auth/context.js'
import type { Tx } from '../../db/with-tenant.js'
import { apiError } from '../../http/errors.js'
import { money } from '../../http/serialize.js'
import * as q from './queries.js'

type Kind = 'percent' | 'fixed'
type Scope = 'item' | 'order'
type DiscountInput = { name?: string; kind?: Kind; value?: number; scope?: Scope; is_active?: boolean }

const toResponse = (d: q.DiscountRow) => ({
  ...d,
  kind: d.kind as Kind,
  scope: d.scope as Scope,
  value: money(d.value),
})

// SPEC §6.5: percent 1..10000 bps, fixed > 0 rupiah.
const assertValue = (kind: Kind, value: number) => {
  if (kind === 'percent' && value > 10_000) {
    throw apiError('VALIDATION', { field: 'value', problem: 'percent_max_10000_bps' })
  }
}

const load = async (trx: Tx, auth: AuthContext, id: string) => {
  const row = await q.findDiscountForUpdate(trx, auth.tenantId, id)
  if (!row) throw apiError('NOT_FOUND')
  return row
}

export const listDiscounts = async (trx: Tx, auth: AuthContext) => ({
  discounts: (await q.listDiscounts(trx, auth.tenantId)).map(toResponse),
})

export const createDiscount = async (
  trx: Tx,
  auth: AuthContext,
  input: DiscountInput & { name: string; kind: Kind; value: number; scope: Scope },
) => {
  assertValue(input.kind, input.value)
  return toResponse(
    await q.insertDiscount(trx, { ...input, tenant_id: auth.tenantId, value: BigInt(input.value) }),
  )
}

export const updateDiscount = async (trx: Tx, auth: AuthContext, id: string, input: DiscountInput) => {
  const current = await load(trx, auth, id)
  const kind = input.kind ?? (current.kind as Kind)
  if (input.kind !== undefined && input.kind !== current.kind && input.value === undefined) {
    throw apiError('VALIDATION', { field: 'value', problem: 'required_when_kind_changes' })
  }
  assertValue(kind, input.value ?? money(current.value))
  const { value, ...rest } = input
  const patch = { ...rest, ...(value !== undefined ? { value: BigInt(value) } : {}) }
  return toResponse(
    Object.keys(patch).length > 0 ? await q.updateDiscount(trx, auth.tenantId, id, patch) : current,
  )
}

export const archiveDiscount = async (trx: Tx, auth: AuthContext, id: string) => {
  await load(trx, auth, id)
  await q.updateDiscount(trx, auth.tenantId, id, { archived_at: new Date() })
}
