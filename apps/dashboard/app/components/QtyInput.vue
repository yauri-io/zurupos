<script setup lang="ts">
// Decimal quantity input; emits the canonical decimal string ("7.5") or null.
defineProps<{ unit?: string }>()
const model = defineModel<string | null>({ required: true })
const text = ref(model.value === null ? '' : model.value.replace('.', ','))
watch(model, (value) => {
  if (value !== parseQtyInput(text.value)) text.value = value === null ? '' : value.replace('.', ',')
})
const onInput = (value: string | number) => {
  text.value = String(value)
  model.value = parseQtyInput(text.value)
}
</script>

<template>
  <UInput :model-value="text" inputmode="decimal" class="w-full" @update:model-value="onInput">
    <template v-if="unit" #trailing
      ><span class="text-muted text-sm">{{ unit }}</span></template
    >
  </UInput>
</template>
