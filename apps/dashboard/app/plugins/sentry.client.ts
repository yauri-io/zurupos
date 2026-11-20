// Browser error reporting (D-053). Off unless NUXT_PUBLIC_SENTRY_DSN is set.
// Errors only: no tracing, no session replay (it would record customer names
// and amounts on screen).
import * as Sentry from '@sentry/vue'
import { ApiFailure } from '~/composables/useApi'
import { scrubBreadcrumb, scrubEvent } from '~/utils/sentry-scrub'

export default defineNuxtPlugin((nuxtApp) => {
  const { sentryDsn, sentryEnvironment, sentryRelease } = useRuntimeConfig().public
  if (!sentryDsn) return

  Sentry.init({
    app: nuxtApp.vueApp,
    dsn: sentryDsn,
    environment: sentryEnvironment,
    ...(sentryRelease ? { release: sentryRelease } : {}),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: (event, hint) => {
      // 4xx answers (validation, permission, not found) are expected; the API
      // reports its own 5xx.
      const err = hint.originalException
      if (err instanceof ApiFailure && err.status < 500) return null
      return scrubEvent(event)
    },
  })
})
