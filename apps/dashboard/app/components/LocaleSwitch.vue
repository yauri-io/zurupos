<script setup lang="ts">
const { locale, setLocale } = useI18n()
</script>

<template>
  <div class="flex gap-1">
    <UButton
      v-for="code in ['id', 'en'] as const"
      :key="code"
      size="xs"
      :variant="locale === code ? 'soft' : 'ghost'"
      color="neutral"
      :label="code.toUpperCase()"
      @click="setLocale(code)"
    />
  </div>
</template>
