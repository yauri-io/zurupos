<script setup lang="ts">
// Rupiah input: shows "25.000", emits whole rupiah (or null while invalid).
const model = defineModel<number | null>({ required: true })
const text = ref(model.value === null ? '' : formatIdr(model.value).replace(/^Rp /, ''))
watch(model, (value) => {
  if (value !== parseRupiah(text.value))
    text.value = value === null ? '' : formatIdr(value).replace(/^Rp /, '')
})
const onInput = (value: string | number) => {
  text.value = String(value)
  model.value = parseRupiah(text.value)
}
</script>

<template>
  <UInput :model-value="text" inputmode="numeric" class="w-full" @update:model-value="onInput">
    <template #leading><span class="text-muted text-sm">Rp</span></template>
  </UInput>
</template>
