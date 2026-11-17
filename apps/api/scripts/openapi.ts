// Writes the OpenAPI document to packages/api-client/openapi.json. The database
// pool is created but never connected: building routes needs no queries.
import { writeFile } from 'node:fs/promises'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'
import { createDb } from '../src/db/kysely.js'

const config = loadConfig({ ...process.env, NODE_ENV: 'test' })
const db = createDb(config.databaseUrl, 1)
const app = await buildApp({ config, db })
await app.ready()
const out = new URL('../../../packages/api-client/openapi.json', import.meta.url)
await writeFile(out, `${JSON.stringify(app.swagger(), null, 2)}\n`)
await app.close()
await db.destroy()
console.log(`wrote ${out.pathname}`)
