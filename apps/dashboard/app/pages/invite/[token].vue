<script setup lang="ts">
definePageMeta({ layout: 'auth', public: true })
const { t } = useI18n()
const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))
</script>

<template>
  <SetPasswordForm :title="t('auth.invite_title')" :token="token" endpoint="invite" />
</template>
