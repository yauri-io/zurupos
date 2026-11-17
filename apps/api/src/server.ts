import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import { createDb } from './db/kysely.js'
import { assertSafeDbRole } from './db/role-guard.js'

const config = loadConfig()
const db = createDb(config.databaseUrl, config.databasePoolMax)
try {
  await assertSafeDbRole(db)
} catch (err) {
  await db.destroy()
  throw err
}
const app = await buildApp({ config, db })

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  await db.destroy()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

await app.listen({ host: config.host, port: config.port })
