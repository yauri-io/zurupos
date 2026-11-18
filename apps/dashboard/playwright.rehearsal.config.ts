import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// The browser e2e specs against the local rehearsal of the production stack
// (docs/DEPLOY.md): real domains over HTTPS, resolved to Caddy on 127.0.0.1:9443.
// Only specs that act through the browser apply; the others call the API from
// Node, which doesn't use these host rules.
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    baseURL: 'https://app.zurupos.com',
    // The rehearsal uses a self-signed certificate.
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP app.zurupos.com:443 127.0.0.1:9443, MAP api.zurupos.com:443 127.0.0.1:9443',
      ],
    },
  },
})
