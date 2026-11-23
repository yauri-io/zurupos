<script setup lang="ts">
// An empty list that explains what the page is for and offers the first step.
defineProps<{ icon: string; title: string; description?: string }>()
</script>

<template>
  <div class="text-center py-12 px-4 flex flex-col items-center gap-3" data-testid="empty-state">
    <UIcon :name="icon" class="size-10 text-muted" />
    <p class="font-medium">{{ title }}</p>
    <p v-if="description" class="text-sm text-muted max-w-md">{{ description }}</p>
    <div v-if="$slots.default" class="flex flex-col items-center gap-3 mt-1">
      <slot />
    </div>
  </div>
</template>
