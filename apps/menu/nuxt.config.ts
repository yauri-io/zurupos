// The public online menu (SPEC §12.7): server-rendered, read-only, no
// credentials. Data comes only from the API's /v1/public routes.
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  modules: ['@nuxt/eslint'],
  devtools: { enabled: false },
  ssr: true,
  // The page components live in packages/menu-ui (shared with the dashboard preview).
  build: { transpile: ['@zurupos/menu-ui'] },
  app: {
    head: {
      htmlAttrs: { lang: 'id' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#fbfaf7' },
      ],
      link: [{ rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48' }],
    },
  },
  runtimeConfig: {
    // NUXT_API_INTERNAL_BASE: the API over the internal network (http://api:4000 in compose).
    apiInternalBase: 'http://localhost:4000',
    // NUXT_MEDIA_BASE_URL: the API's MEDIA_PUBLIC_BASE_URL, for the CSP's img-src.
    mediaBaseUrl: 'http://localhost:4000/media',
    public: {
      // NUXT_PUBLIC_SITE_URL: this site's base, the same as the API's MENU_PUBLIC_BASE_URL
      // (canonical and og:url; public because the client re-renders the head).
      siteUrl: 'http://localhost:3001',
      // NUXT_PUBLIC_LANDING_URL: "Menu oleh ZuruPOS" and the bare domain go here.
      landingUrl: 'https://zurupos.com',
    },
  },
  nitro: { compressPublicAssets: true },
  typescript: { strict: true, typeCheck: false },
})
