<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center px-4 py-10 bg-(--ui-bg-muted)">
    <div class="w-full max-w-sm">
      <img src="/logo-mark.png" alt="" class="size-16 mx-auto mb-3" />
      <p class="text-center text-xl font-semibold mb-6">{{ t('app.name') }}</p>
      <UCard>
        <slot />
      </UCard>
      <LocaleSwitch class="mt-4 justify-center" />
    </div>
  </div>
</template>
