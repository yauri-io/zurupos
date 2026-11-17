<script setup lang="ts">
definePageMeta({ layout: 'auth', public: true })
const { t } = useI18n()
const { login, can } = useAuth()
const notify = useNotify()
const route = useRoute()

const form = reactive({ email: '', password: '' })
const busy = ref(false)

const submit = async () => {
  busy.value = true
  try {
    await login(form.email.trim(), form.password)
    const next =
      typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : null
    await navigateTo(next ?? (can('reports.view') ? '/' : '/menu'))
  } catch (err) {
    notify.failed(err)
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
    <UButton type="submit" block :loading="busy" :label="t('auth.login')" />
    <ULink to="/forgot" class="text-sm text-center">{{ t('auth.forgot_link') }}</ULink>
    <ULink to="/signup" class="text-sm text-center">{{ t('auth.signup_link') }}</ULink>
  </UForm>
</template>
