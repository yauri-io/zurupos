// Outbox (SPEC §10). The email is rendered by the caller and inserted inside the
// caller's tenant transaction, so it is atomic with the business change.
// zuru_app has INSERT only on outbox; the worker (M3) sends it.
import type { Tx } from '../db/with-tenant.js'
import type { RenderedEmail } from './templates/types.js'

export type EmailKind = 'low_stock' | 'password_reset' | 'manager_invite'

export const enqueueEmail = (
  trx: Tx,
  input: { tenantId: string; kind: EmailKind; to: string[]; email: RenderedEmail },
) =>
  trx
    .insertInto('outbox')
    .values({
      tenant_id: input.tenantId,
      kind: input.kind,
      to_addresses: [...new Set(input.to.map((a) => a.toLowerCase()))],
      subject: input.email.subject,
      html: input.email.html,
      text: input.email.text,
    })
    .execute()
