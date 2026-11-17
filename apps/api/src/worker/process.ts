// One pass of the outbox worker (SPEC §10). Runs as zuru_worker, which can read
// and update the outbox and nothing else. `for update skip locked` lets several
// workers run side by side without sending an email twice.
import { sql } from 'kysely'
import type { Database } from '../db/kysely.js'
import { retryDelay } from './backoff.js'
import type { EmailSender } from './providers/types.js'

export type BatchResult = { sent: number; retried: number; failed: number }

export const processBatch = async (
  db: Database,
  send: EmailSender,
  opts: { from: string; batchSize?: number; log?: (msg: string, data: Record<string, unknown>) => void },
): Promise<BatchResult> =>
  db.transaction().execute(async (trx) => {
    const rows = await trx
      .selectFrom('outbox')
      .select(['id', 'kind', 'to_addresses', 'subject', 'html', 'text', 'attempts'])
      .where('status', '=', 'pending')
      .where('next_attempt_at', '<=', sql<Date>`now()`)
      .orderBy('created_at')
      .limit(opts.batchSize ?? 10)
      .forUpdate()
      .skipLocked()
      .execute()

    const result: BatchResult = { sent: 0, retried: 0, failed: 0 }
    for (const row of rows) {
      try {
        await send({
          from: opts.from,
          to: row.to_addresses,
          subject: row.subject,
          html: row.html,
          text: row.text,
        })
        await trx
          .updateTable('outbox')
          .set({ status: 'sent', sent_at: sql<Date>`now()`, attempts: row.attempts + 1, last_error: null })
          .where('id', '=', row.id)
          .execute()
        result.sent++
      } catch (err) {
        const attempts = row.attempts + 1
        const delay = retryDelay(attempts)
        // Only the error message is stored: never the email body or addresses.
        const lastError = (err instanceof Error ? err.message : String(err)).slice(0, 500)
        await trx
          .updateTable('outbox')
          .set(
            delay === null
              ? { status: 'failed', attempts, last_error: lastError }
              : {
                  attempts,
                  last_error: lastError,
                  next_attempt_at: sql<Date>`now() + make_interval(secs => ${delay / 1000})`,
                },
          )
          .where('id', '=', row.id)
          .execute()
        if (delay === null) {
          result.failed++
          opts.log?.('outbox email failed permanently', {
            id: row.id,
            kind: row.kind,
            attempts,
            error: lastError,
          })
        } else {
          result.retried++
        }
      }
    }
    return result
  })
