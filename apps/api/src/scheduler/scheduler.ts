// Report email scheduler process (SPEC §12.6): `node dist/scheduler/scheduler.js`.
// Every SCHEDULER_POLL_MS (default 5 minutes) it runs one pass; the outbox worker
// sends what it queued.
import pino from 'pino'
import { loadSchedulerConfig } from '../config/env.js'
import { createDb, idleErrorFields } from '../db/kysely.js'
import { assertSafeDbRole } from '../db/role-guard.js'
import { captureError, closeSentry, initSentry } from '../observability/sentry.js'
import { runPass } from './run.js'

const config = loadSchedulerConfig()
initSentry(config.sentry, 'scheduler')
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

let stopping = false
let timer: NodeJS.Timeout | undefined

const tick = async () => {
  try {
    const r = await runPass(db, {
      now: new Date(),
      dashboardUrl: config.dashboardUrl,
      onError: (err, ctx) => {
        // Ids only: no shop names or figures in logs or Sentry.
        log.error({ err, ...ctx }, 'report email failed')
        captureError(err)
      },
    })
    if (r.sent + r.skipped_empty + r.no_owner + r.failed > 0) log.info(r, 'report pass')
  } catch (err) {
    log.error({ err }, 'report pass crashed')
    captureError(err)
  }
  if (!stopping) timer = setTimeout(() => void tick(), config.pollIntervalMs)
}

const shutdown = async (signal: string) => {
  log.info({ signal }, 'scheduler shutting down')
  stopping = true
  if (timer) clearTimeout(timer)
  await db.destroy()
  await closeSentry()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

log.info({ pollIntervalMs: config.pollIntervalMs }, 'scheduler started')
void tick()
