<script setup lang="ts">
definePageMeta({ layout: 'auth', public: true })
const { t, locale } = useI18n()
const { login, can } = useAuth()
const notify = useNotify()
const route = useRoute()

const form = reactive({ email: '', password: '' })
const busy = ref(false)

// Cloudflare Turnstile (D-064): on when a site key is configured.
const siteKey = useRuntimeConfig().public.turnstileSiteKey
const captchaToken = ref('')
const captcha = useTemplateRef('captcha')

const submit = async () => {
  busy.value = true
  try {
    await login(form.email.trim(), form.password, siteKey ? captchaToken.value : undefined)
    const next =
      typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : null
    await navigateTo(next ?? (can('reports.view') ? '/' : '/menu'))
  } catch (err) {
    // Every login failure is the same 401 (SPEC §5.1); say what it means here.
    notify.failed(
      err,
      err instanceof ApiFailure && err.status === 401 ? t('auth.invalid_credentials') : undefined,
    )
    // The token was spent on this attempt, right or wrong.
    captcha.value?.reset()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UForm :state="form" class="flex flex-col gap-4" @submit="submit">
    <h1 class="text-lg font-semibold">{{ t('auth.login_title') }}</h1>
    <UFormField :label="t('auth.email')" name="email" required>
      <UInput v-model="form.email" type="email" autocomplete="username" class="w-full" />
    </UFormField>
    <UFormField :label="t('auth.password')" name="password" required>
      <UInput v-model="form.password" type="password" autocomplete="current-password" class="w-full" />
    </UFormField>
    <TurnstileWidget
      v-if="siteKey"
      ref="captcha"
      :key="locale"
      v-model="captchaToken"
      :site-key="siteKey"
      action="login"
    />
    <UButton
      type="submit"
      block
      :loading="busy"
      :disabled="!!siteKey && !captchaToken"
      :label="t('auth.login')"
    />
    <ULink to="/forgot" class="text-sm text-center">{{ t('auth.forgot_link') }}</ULink>
    <ULink to="/signup" class="text-sm text-center">{{ t('auth.signup_link') }}</ULink>
  </UForm>
</template>
