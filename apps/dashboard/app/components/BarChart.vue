<script setup lang="ts">
// A dependency-free bar chart (D-045): one bar per point, scaled to the largest.
const props = defineProps<{ points: { label: string; value: number }[]; format: (v: number) => string }>()
const max = computed(() => Math.max(1, ...props.points.map((p) => p.value)))
</script>

<template>
  <div class="flex items-end gap-1 h-40 overflow-x-auto pb-6 relative" role="img">
    <div
      v-for="p in points"
      :key="p.label"
      class="flex flex-col items-center justify-end h-full min-w-6 flex-1"
      :title="`${p.label}: ${format(p.value)}`"
    >
      <div class="w-full rounded-t bg-primary/80" :style="{ height: `${(p.value / max) * 100}%` }" />
      <span class="text-[10px] text-muted mt-1 whitespace-nowrap">{{ p.label }}</span>
    </div>
  </div>
</template>
