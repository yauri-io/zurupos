import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import { createDb, idleErrorFields } from './db/kysely.js'
import { assertSafeDbRole } from './db/role-guard.js'
import { closeSentry, initSentry } from './observability/sentry.js'

const config = loadConfig()
initSentry(config.sentry, 'api')
// Replaced by the app's logger once it exists.
let logIdleError = (err: Error) => {
  console.error('database connection lost:', err.message)
}
const db = createDb(config.databaseUrl, config.databasePoolMax, (err) => {
  logIdleError(err)
})
try {
  await assertSafeDbRole(db)
} catch (err) {
  await db.destroy()
  throw err
}
const app = await buildApp({ config, db })
logIdleError = (err) => {
  app.log.warn(idleErrorFields(err), 'database connection lost; reconnecting on the next query')
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  await db.destroy()
  await closeSentry()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

await app.listen({ host: config.host, port: config.port })
