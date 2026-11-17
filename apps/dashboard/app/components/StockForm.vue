<script setup lang="ts">
// Shared layout for the stock-in / waste pages: pick an ingredient, then the slot.
defineProps<{ title: string; valid: boolean; saving: boolean }>()
const emit = defineEmits<{ submit: [] }>()
const { t } = useI18n()
const ingredientId = defineModel<string | undefined>('ingredientId', { required: true })
const api = useApi()
const ingredients = (await unwrap(api.GET('/v1/ingredients'))).ingredients
const items = computed(() =>
  ingredients.map((i) => ({ value: i.id, label: `${i.name} (${formatQty(i.stock_qty, i.base_unit)})` })),
)
const selected = computed(() => ingredients.find((i) => i.id === ingredientId.value))
</script>

<template>
  <PagePanel :title="title">
    <template #actions>
      <UButton
        to="/inventory"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        :label="t('nav.inventory')"
      />
    </template>
    <UForm :state="{}" class="flex flex-col gap-4 max-w-md" @submit="emit('submit')">
      <UFormField :label="t('inventory.ingredient')" name="ingredient" required>
        <USelectMenu
          v-model="ingredientId"
          :items="items"
          value-key="value"
          class="w-full"
          data-testid="ingredient"
        />
      </UFormField>
      <slot :ingredient="selected" />
      <UButton
        type="submit"
        :label="t('common.save')"
        :loading="saving"
        :disabled="!valid"
        class="self-start"
      />
    </UForm>
  </PagePanel>
</template>
