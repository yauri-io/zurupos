<script setup lang="ts">
// 404 "Menu tidak ditemukan" and other errors; never indexed (SPEC §12.7).
import { pickLocale, translate, type Locale } from '@zurupos/menu-ui'
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const config = useRuntimeConfig()
const locale = useState<Locale>('locale', () =>
  pickLocale(useRequestHeaders(['accept-language'])['accept-language']),
)
const notFound = computed(() => props.error.statusCode === 404)
const t = (key: Parameters<typeof translate>[1]) => translate(locale.value, key)
const title = computed(() => (notFound.value ? t('not_found') : t('error')))

useHead({
  htmlAttrs: { lang: locale.value },
  title,
  meta: [{ name: 'robots', content: 'noindex' }],
})
if (import.meta.server) useResponseHeader('cache-control').value = 'no-store'
</script>

<template>
  <main class="zm-error">
    <h1>{{ title }}</h1>
    <p>{{ notFound ? t('not_found_text') : t('error_text') }}</p>
    <a :href="config.public.landingUrl">{{ t('to_landing') }}</a>
  </main>
</template>

<style scoped>
.zm-error {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 16px;
  text-align: center;
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    sans-serif;
  background: #fbfaf7;
  color: #1f1f1f;
}
h1 {
  margin: 0;
  font-size: 1.5rem;
}
p {
  margin: 0;
  color: #5e5e5e;
}
a {
  color: #6b4f3a;
  font-weight: 600;
}
</style>
