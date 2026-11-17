import { loadConfig, type Config } from '../src/config/env.js'

// Integration tests always run against the real test database as zuru_app.
export const testConfig = (overrides: Partial<Config> = {}): Config => ({
  ...loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: process.env['TEST_DATABASE_URL'] }),
  ...overrides,
})
