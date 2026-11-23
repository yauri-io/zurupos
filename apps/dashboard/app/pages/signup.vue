<script setup lang="ts">
// Create a shop and its owner (D-017). The API answers 404 when SIGNUP_ENABLED is off.
definePageMeta({ layout: 'auth', public: true })
const { t, locale } = useI18n()
const api = useApi()
const { load } = useAuth()
const notify = useNotify()
useHead({ title: () => t('auth.signup_title') })

const form = reactive({ shop_name: '', name: '', email: '', password: '', pin: '' })
const busy = ref(false)
const closed = ref(false)
const valid = computed(
  () =>
    form.shop_name.trim() !== '' &&
    form.name.trim() !== '' &&
    form.email.trim() !== '' &&
    form.password.length >= 8 &&
    /^\d{4,6}$/.test(form.pin),
)
const submit = async () => {
  busy.value = true
  try {
    await unwrap(
      api.POST('/v1/auth/signup', {
        body: {
          shop_name: form.shop_name.trim(),
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          pin: form.pin,
          locale: locale.value === 'en' ? 'en' : 'id',
        },
      }),
    )
    await load(true)
    await navigateTo('/')
  } catch (err) {
    if (err instanceof ApiFailure && err.status === 404) closed.value = true
    else notify.failed(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UForm :state="form" class="flex flex-col gap-4" @submit="submit">
    <h1 class="text-lg font-semibold">{{ t('auth.signup_title') }}</h1>
    <UAlert v-if="closed" color="warning" variant="subtle" :description="t('auth.signup_closed')" />
    <UFormField :label="t('settings.shop_name')" name="shop_name" required>
      <UInput v-model="form.shop_name" :maxlength="120" class="w-full" />
    </UFormField>
    <UFormField :label="t('auth.your_name')" name="name" required>
      <UInput v-model="form.name" :maxlength="80" autocomplete="name" class="w-full" />
    </UFormField>
    <UFormField :label="t('auth.email')" name="email" required>
      <UInput v-model="form.email" type="email" autocomplete="username" class="w-full" />
    </UFormField>
    <UFormField :label="t('auth.password')" :help="t('auth.password_rules')" name="password" required>
      <UInput v-model="form.password" type="password" autocomplete="new-password" class="w-full" />
    </UFormField>
    <UFormField :label="t('users.pin')" :help="t('auth.owner_pin_help')" name="pin" required>
      <UInput v-model="form.pin" inputmode="numeric" :maxlength="6" class="w-full" />
    </UFormField>
    <UButton type="submit" block :loading="busy" :disabled="!valid" :label="t('auth.signup')" />
    <ULink to="/login" class="text-sm text-center">{{ t('auth.have_account') }}</ULink>
  </UForm>
</template>
