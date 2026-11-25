<script setup lang="ts">
import type { DateRange, Preset } from '../utils/dates'

// Every report: title, the range picker, a loading/error state, then the body.
defineProps<{
  title: string
  range: DateRange
  today: string
  pending: boolean
  error: unknown
  presets?: Preset[]
}>()
const emit = defineEmits<{ range: [DateRange] }>()
const { t } = useI18n()
</script>

<template>
  <PagePanel :title="title">
    <div class="flex flex-col gap-4">
      <DateRangePicker
        :model-value="range"
        :today="today"
        :presets="presets"
        @update:model-value="emit('range', $event)"
      />
      <p v-if="error" class="text-error">{{ t('common.unexpected_error') }}</p>
      <div v-else :class="{ 'opacity-50': pending }"><slot /></div>
    </div>
  </PagePanel>
</template>
