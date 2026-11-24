<script setup lang="ts">
// The running dashboard build (D-057), so anyone can tell which version they're on.
const { t } = useI18n()
const version = useRuntimeConfig().public.appVersion
</script>

<template>
  <p class="text-xs text-dimmed tabular-nums truncate" data-testid="app-version">
    {{ t('version.label', { version }) }}
  </p>
</template>
