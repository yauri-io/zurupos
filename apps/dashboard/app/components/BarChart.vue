<script setup lang="ts">
// A dependency-free bar chart (D-045): one bar per point, scaled to the largest.
// When the bars don't fit, the row scrolls sideways; `startAtEnd` opens it on
// the last bars (for day series, where the newest day matters most).
const props = defineProps<{
  points: { label: string; value: number }[]
  format: (v: number) => string
  startAtEnd?: boolean
}>()
const max = computed(() => Math.max(1, ...props.points.map((p) => p.value)))
const row = ref<HTMLElement | null>(null)
const toEnd = () => {
  if (props.startAtEnd && row.value) row.value.scrollLeft = row.value.scrollWidth
}
onMounted(toEnd)
watch(
  () => props.points,
  () => nextTick(toEnd),
)
</script>

<template>
  <div ref="row" class="flex items-end gap-1 h-40 overflow-x-auto pb-6 relative" role="img">
    <!-- Keyed by position: labels such as day numbers can repeat within a range. -->
    <div
      v-for="(p, i) in points"
      :key="i"
      class="flex flex-col items-center justify-end h-full min-w-6 flex-1"
      :title="`${p.label}: ${format(p.value)}`"
    >
      <div class="w-full rounded-t bg-primary/80" :style="{ height: `${(p.value / max) * 100}%` }" />
      <span class="text-[10px] text-muted mt-1 whitespace-nowrap">{{ p.label }}</span>
    </div>
  </div>
</template>
