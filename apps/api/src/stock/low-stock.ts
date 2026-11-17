// SPEC §8: after any stock change, in the same transaction, for the touched
// ingredients. One email per crossing; re-armed when stock rises above threshold.
import type { Config } from '../config/env.js'
import type { Tx } from '../db/with-tenant.js'
import { enqueueEmail } from '../outbox/enqueue.js'
import { renderLowStock } from '../outbox/templates/low-stock.js'
import type { LockedIngredient } from './ledger.js'

export const checkLowStock = async (
  trx: Tx,
  config: Config,
  tenantId: string,
  touched: Iterable<LockedIngredient>,
) => {
  const crossed: LockedIngredient[] = []
  const rearmed: string[] = []
  for (const i of touched) {
    if (i.threshold <= 0n) continue
    if (i.stockQty <= i.threshold && i.alertedAt === null) crossed.push(i)
    else if (i.stockQty > i.threshold && i.alertedAt !== null) rearmed.push(i.id)
  }
  if (crossed.length > 0) {
    const now = new Date()
    await trx
      .updateTable('ingredients')
      .set({ low_stock_alerted_at: now })
      .where('tenant_id', '=', tenantId)
      .where(
        'id',
        'in',
        crossed.map((i) => i.id),
      )
      .execute()
    for (const i of crossed) i.alertedAt = now
  }
  if (rearmed.length > 0) {
    await trx
      .updateTable('ingredients')
      .set({ low_stock_alerted_at: null })
      .where('tenant_id', '=', tenantId)
      .where('id', 'in', rearmed)
      .execute()
  }
  if (crossed.length === 0) return

  const tenant = await trx
    .selectFrom('tenants')
    .select(['name', 'low_stock_alerts_enabled', 'alert_extra_emails'])
    .where('id', '=', tenantId)
    .executeTakeFirstOrThrow()
  if (!tenant.low_stock_alerts_enabled) return
  const owner = await trx
    .selectFrom('users')
    .select(['email', 'locale'])
    .where('tenant_id', '=', tenantId)
    .where('role', '=', 'owner')
    .where('is_active', '=', true)
    .executeTakeFirst()
  const to = [...(owner?.email ? [owner.email] : []), ...tenant.alert_extra_emails]
  if (to.length === 0) return

  await enqueueEmail(trx, {
    tenantId,
    kind: 'low_stock',
    to,
    email: renderLowStock({
      locale: owner?.locale === 'en' ? 'en' : 'id',
      shopName: tenant.name,
      lines: [...crossed]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((i) => ({ name: i.name, baseUnit: i.baseUnit, stockQty: i.stockQty, threshold: i.threshold })),
      link: `${config.dashboardUrl}/inventory`,
    }),
  })
}
