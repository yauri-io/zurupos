export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  modules: ['@nuxt/ui', '@nuxtjs/i18n', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  ssr: false,
  runtimeConfig: {
    public: {
      // Overridden by NUXT_PUBLIC_API_BASE.
      apiBase: 'http://localhost:4000',
      // Error reporting (D-053): NUXT_PUBLIC_SENTRY_DSN, _ENVIRONMENT, _RELEASE.
      // An empty DSN keeps Sentry off.
      sentryDsn: '',
      sentryEnvironment: 'development',
      sentryRelease: '',
    },
  },
  icon: {
    // Bundle every icon the app names, including those in .ts files (navigation,
    // actions), and never fetch icons from api.iconify.design: production's CSP
    // blocks it, and the dashboard shouldn't depend on a third-party service.
    clientBundle: { scan: { globInclude: ['app/**/*.{vue,ts}'] } },
    fallbackToApi: false,
  },
  i18n: {
    defaultLocale: 'id',
    strategy: 'no_prefix',
    locales: [
      { code: 'id', language: 'id-ID', name: 'Bahasa Indonesia', file: 'id.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
  typescript: { strict: true, typeCheck: false },
})
