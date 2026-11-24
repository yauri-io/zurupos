<script setup lang="ts">
import type { TurnstileApi } from '~/utils/turnstile'

// Cloudflare Turnstile challenge (D-064). The token is single-use: call reset()
// after every submit so the next attempt gets a fresh one.
const props = defineProps<{ siteKey: string; action: string }>()
const token = defineModel<string>({ default: '' })
const { t, locale } = useI18n()

const el = ref<HTMLElement>()
const failed = ref(false)
let api: TurnstileApi | undefined
let widgetId: string | undefined

onMounted(async () => {
  try {
    api = await loadTurnstile()
  } catch {
    failed.value = true
    return
  }
  if (!el.value) return
  widgetId = api.render(el.value, {
    sitekey: props.siteKey,
    action: props.action,
    language: locale.value,
    theme: 'auto',
    callback: (value) => {
      failed.value = false
      token.value = value
    },
    'expired-callback': () => {
      token.value = ''
    },
    'error-callback': () => {
      token.value = ''
      failed.value = true
    },
  })
})

onBeforeUnmount(() => {
  if (api && widgetId) api.remove(widgetId)
})

const reset = () => {
  token.value = ''
  if (api && widgetId) api.reset(widgetId)
}

defineExpose({ reset })
</script>

<template>
  <div class="flex flex-col items-center gap-1">
    <div ref="el" data-testid="turnstile" />
    <p v-if="failed" class="text-sm text-error text-center">{{ t('auth.captcha_unavailable') }}</p>
  </div>
</template>
