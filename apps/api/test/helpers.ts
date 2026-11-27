import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, type Config } from '../src/config/env.js'

// Uploaded test images go to a scratch folder, never the dev media folder.
export const TEST_MEDIA_DIR = join(tmpdir(), 'zurupos-test-media')

// Integration tests always run against the real test database as zuru_app.
export const testConfig = (overrides: Partial<Config> = {}): Config => ({
  ...loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: process.env['TEST_DATABASE_URL'],
    MEDIA_DRIVER: 'local',
    MEDIA_LOCAL_DIR: TEST_MEDIA_DIR,
  }),
  ...overrides,
})
