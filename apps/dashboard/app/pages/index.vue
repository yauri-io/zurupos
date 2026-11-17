<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => t('app.name') })
</script>

<template>
  <UContainer class="py-10">
    <h1 class="text-2xl font-semibold">{{ t('app.name') }}</h1>
    <p class="text-muted mt-2">{{ t('home.placeholder') }}</p>
  </UContainer>
</template>
