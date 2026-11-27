<script setup lang="ts">
// menu.zurupos.com/<slug> (SPEC §12.7). Server-rendered from the API's public
// payload; an old slug redirects (308) to the current one, keeping ?s=qr.
import { jsonLdString, menuSeo, MenuPage, pickLocale, type Locale } from '@zurupos/menu-ui'
import type { MenuData } from '../../server/utils/menu-data'

const route = useRoute()
const config = useRuntimeConfig()
const slug = String(route.params['slug'] ?? '')

// Decided once on the server and carried to the client, so hydration matches.
const locale = useState<Locale>('locale', () =>
  pickLocale(useRequestHeaders(['accept-language'])['accept-language']),
)
const now = useState('now', () => new Date().toISOString())

const { data, error } = await useAsyncData(`menu:${slug}`, () =>
  $fetch<MenuData>(`/_data/menu/${encodeURIComponent(slug)}`, {
    headers: useRequestHeaders(['x-forwarded-for']),
  }),
)
if (error.value) throw createError({ statusCode: 503, statusMessage: 'Menu unavailable', fatal: true })
const result = data.value
if (!result || result.kind === 'not_found') {
  throw createError({ statusCode: 404, statusMessage: 'Not found', fatal: true })
}
if (result.kind === 'moved') {
  await navigateTo(`/${result.slug}${route.query['s'] === 'qr' ? '?s=qr' : ''}`, { redirectCode: 308 })
}
const menu = result.kind === 'menu' ? result.menu : null

// Always ask again: the page follows the POS (prices, Habis) within ~15 s.
if (import.meta.server) useResponseHeader('cache-control').value = 'no-cache'

// One view per page load (O3, D-083): a beacon after load, `qr` when the URL
// came from the QR code. The dashboard preview renders MenuPage directly, not
// this page, so it never sends one.
onMounted(() => {
  if (!menu) return
  const source = route.query['s'] === 'qr' ? 'qr' : 'link'
  try {
    navigator.sendBeacon(`/v1/public/menus/${encodeURIComponent(slug)}/views`, JSON.stringify({ source }))
  } catch {
    // Counting is best effort; the page never depends on it.
  }
  // A link copied from this page shouldn't count as a QR scan.
  if (source === 'qr') {
    const url = new URL(window.location.href)
    url.searchParams.delete('s')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }
})

if (menu) {
  const canonical = `${config.public.siteUrl}/${slug}`
  const seo = menuSeo(menu, canonical, locale.value)
  useHead({
    htmlAttrs: { lang: locale.value },
    title: seo.title,
    link: [{ rel: 'canonical', href: canonical }],
    meta: [
      { name: 'description', content: seo.description },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: canonical },
      { property: 'og:title', content: seo.title },
      { property: 'og:description', content: seo.description },
      { property: 'og:site_name', content: menu.shop.name },
      { property: 'og:locale', content: locale.value === 'en' ? 'en_US' : 'id_ID' },
      ...(seo.image ? [{ property: 'og:image', content: seo.image }] : []),
      { name: 'twitter:card', content: seo.twitterCard },
      { name: 'twitter:title', content: seo.title },
      { name: 'twitter:description', content: seo.description },
      ...(seo.image ? [{ name: 'twitter:image', content: seo.image }] : []),
      { name: 'theme-color', content: menu.shop.accent_color },
    ],
    script: [{ type: 'application/ld+json', innerHTML: jsonLdString(seo.jsonLd) }],
  })
}
</script>

<template>
  <MenuPage
    v-if="menu"
    :menu="menu"
    :locale="locale"
    :now="new Date(now)"
    :landing-url="config.public.landingUrl"
  />
</template>
