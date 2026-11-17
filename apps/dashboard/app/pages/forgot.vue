<script setup lang="ts">
definePageMeta({ layout: 'auth', public: true })
const { t } = useI18n()
const api = useApi()
const notify = useNotify()
const email = ref('')
const sent = ref(false)
const busy = ref(false)

const submit = async () => {
  busy.value = true
  try {
    await unwrap(api.POST('/v1/auth/password/forgot', { body: { email: email.value.trim() } }))
    sent.value = true
  } catch (err) {
    notify.failed(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-lg font-semibold">{{ t('auth.forgot_title') }}</h1>
    <UAlert v-if="sent" color="success" variant="subtle" :title="t('auth.forgot_sent')" />
    <UForm v-else :state="{ email }" class="flex flex-col gap-4" @submit="submit">
      <UFormField :label="t('auth.email')" name="email" required>
        <UInput v-model="email" type="email" class="w-full" />
      </UFormField>
      <UButton type="submit" block :loading="busy" :label="t('auth.forgot_submit')" />
    </UForm>
    <ULink to="/login" class="text-sm text-center">{{ t('auth.back_to_login') }}</ULink>
  </div>
</template>
