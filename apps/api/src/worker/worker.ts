// Outbox worker process: `node dist/worker/worker.js`. Polls every WORKER_POLL_MS.
import pino from 'pino'
import { loadWorkerConfig } from '../config/env.js'
import { createDb, idleErrorFields } from '../db/kysely.js'
import { assertSafeDbRole } from '../db/role-guard.js'
import { captureError, captureMessage, closeSentry, initSentry } from '../observability/sentry.js'
import { processBatch } from './process.js'
import { createSender } from './providers/index.js'

const config = loadWorkerConfig()
initSentry(config.sentry, 'worker')
const log = pino({ level: config.logLevel })
const db = createDb(config.databaseUrl, 2, (err) => {
  log.warn(idleErrorFields(err), 'database connection lost; reconnecting on the next query')
})
try {
  await assertSafeDbRole(db)
} catch (err) {
  await db.destroy()
  throw err
}
const send = createSender(config.email)

let stopping = false
let timer: NodeJS.Timeout | undefined

const tick = async () => {
  try {
    // Drain: keep going while full batches come back.
    for (;;) {
      const r = await processBatch(db, send, {
        from: config.email.from,
        log: (msg, data) => {
          log.error(data, msg)
          // The provider's error text can name a recipient, so it stays in the
          // outbox row (last_error) and only the ids go to Sentry.
          captureMessage(msg, { id: data['id'], kind: data['kind'], attempts: data['attempts'] })
        },
      })
      if (r.sent + r.retried + r.failed > 0) log.info(r, 'outbox batch')
      if (r.sent + r.retried + r.failed < 10 || stopping) break
    }
  } catch (err) {
    log.error({ err }, 'outbox batch crashed')
    captureError(err)
  }
  if (!stopping) timer = setTimeout(() => void tick(), config.pollIntervalMs)
}

const shutdown = async (signal: string) => {
  log.info({ signal }, 'worker shutting down')
  stopping = true
  if (timer) clearTimeout(timer)
  await db.destroy()
  await closeSentry()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

log.info({ provider: config.email.provider }, 'outbox worker started')
void tick()
