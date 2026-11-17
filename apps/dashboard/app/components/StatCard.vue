<script setup lang="ts">
defineProps<{ label: string; value: string; hint?: string }>()
</script>

<template>
  <div class="rounded-md border border-default p-3 min-w-0">
    <p class="text-xs text-muted truncate">{{ label }}</p>
    <p class="text-lg font-semibold tabular-nums truncate">{{ value }}</p>
    <p v-if="hint" class="text-xs text-muted truncate">{{ hint }}</p>
  </div>
</template>
