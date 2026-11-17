<script setup lang="ts">
// Shared by password reset and invite acceptance: both take a single-use token.
const props = defineProps<{ title: string; token: string; endpoint: 'reset' | 'invite' }>()
const { t } = useI18n()
const api = useApi()
const notify = useNotify()
const password = ref('')
const confirm = ref('')
const busy = ref(false)
const done = ref(false)
const mismatch = computed(() => confirm.value.length > 0 && confirm.value !== password.value)

const submit = async () => {
  if (mismatch.value) return
  busy.value = true
  try {
    const body = { token: props.token, password: password.value }
    await unwrap(
      props.endpoint === 'reset'
        ? api.POST('/v1/auth/password/reset', { body })
        : api.POST('/v1/auth/invite/accept', { body }),
    )
    done.value = true
  } catch (err) {
    notify.failed(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-lg font-semibold">{{ title }}</h1>
    <template v-if="done">
      <UAlert color="success" variant="subtle" :title="t('auth.password_set')" />
      <UButton to="/login" block :label="t('auth.login')" />
    </template>
    <UForm v-else :state="{ password, confirm }" class="flex flex-col gap-4" @submit="submit">
      <UFormField :label="t('auth.new_password')" :help="t('auth.password_rules')" name="password" required>
        <UInput v-model="password" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>
      <UFormField
        :label="t('auth.confirm_password')"
        name="confirm"
        :error="mismatch ? t('auth.password_mismatch') : undefined"
        required
      >
        <UInput v-model="confirm" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>
      <UButton
        type="submit"
        block
        :loading="busy"
        :disabled="mismatch || !password"
        :label="t('common.save')"
      />
    </UForm>
  </div>
</template>
