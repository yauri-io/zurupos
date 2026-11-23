<script setup lang="ts">
// A small (?) next to a term owners may not know; the explanation opens on tap or click.
defineProps<{ text: string }>()
const { t } = useI18n()
</script>

<template>
  <UPopover :content="{ side: 'top' }">
    <UButton
      icon="i-lucide-circle-help"
      color="neutral"
      variant="link"
      size="xs"
      class="p-0 align-middle text-muted"
      :aria-label="t('common.help')"
    />
    <template #content>
      <p class="p-3 text-sm max-w-xs whitespace-pre-line">{{ text }}</p>
    </template>
  </UPopover>
</template>
