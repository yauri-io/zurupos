<script setup lang="ts">
import { PRESETS, presetRange, type DateRange } from '../utils/dates'

// Presets (SPEC §12.3) plus custom from/to dates.
const props = defineProps<{ modelValue: DateRange; today: string }>()
const emit = defineEmits<{ 'update:modelValue': [DateRange] }>()
const { t } = useI18n()

const active = computed(
  () =>
    PRESETS.find((p) => {
      const r = presetRange(p, props.today)
      return r.from === props.modelValue.from && r.to === props.modelValue.to
    }) ?? null,
)
const from = ref(props.modelValue.from)
const to = ref(props.modelValue.to)
watch(
  () => props.modelValue,
  (v) => {
    from.value = v.from
    to.value = v.to
  },
)
const applyCustom = () => {
  if (from.value && to.value && from.value <= to.value)
    emit('update:modelValue', { from: from.value, to: to.value })
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-2" data-testid="date-range">
    <UButton
      v-for="p in PRESETS"
      :key="p"
      size="sm"
      :variant="active === p ? 'solid' : 'outline'"
      :color="active === p ? 'primary' : 'neutral'"
      :label="t(`range.${p}`)"
      @click="emit('update:modelValue', presetRange(p, today))"
    />
    <div class="flex items-center gap-1">
      <UInput v-model="from" type="date" size="sm" :aria-label="t('range.from')" @change="applyCustom" />
      <span class="text-muted">–</span>
      <UInput v-model="to" type="date" size="sm" :aria-label="t('range.to')" @change="applyCustom" />
    </div>
  </div>
</template>
