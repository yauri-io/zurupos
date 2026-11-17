import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Integration tests share one real Postgres; files run in parallel but each
    // test creates its own tenants, so they never collide.
    pool: 'forks',
  },
})
