import { defineConfig } from '@playwright/test'

// End-to-end tests against the local stack (`docker compose up -d --build --wait`).
// Uses the installed Google Chrome, so no browser download is needed.
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.DASHBOARD_URL ?? 'http://localhost:3000',
    channel: 'chrome',
    locale: 'id-ID',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
})
