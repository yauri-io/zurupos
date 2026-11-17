<script setup lang="ts">
definePageMeta({ layout: 'auth', public: true })
const { t } = useI18n()
const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
</script>

<template>
  <SetPasswordForm :title="t('auth.reset_title')" :token="token" endpoint="reset" />
</template>
