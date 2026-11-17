<script setup lang="ts">
definePageMeta({ permission: 'stock.adjust' })
const { t } = useI18n()
const api = useApi()
const run = useAction()
useHead({ title: () => t('inventory.waste') })

const ingredientId = ref<string>()
const qty = ref<string | null>(null)
const reason = ref<'spilled' | 'expired' | 'mistake' | 'other'>('spilled')
const note = ref('')
const saving = ref(false)
const valid = computed(() => !!ingredientId.value && !!qty.value && qty.value !== '0')
const reasons = computed(() =>
  (['spilled', 'expired', 'mistake', 'other'] as const).map((value) => ({
    value,
    label: t(`inventory.reason_${value}`),
  })),
)
const save = async () => {
  const id = ingredientId.value
  if (!id || !qty.value) return
  saving.value = true
  const ok = await run(() =>
    unwrap(
      api.POST('/v1/stock/waste', {
        body: {
          ingredient_id: id,
          qty: qty.value ?? '0',
          reason: reason.value,
          ...(note.value.trim() ? { note: note.value.trim() } : {}),
        },
      }),
    ),
  )
  saving.value = false
  if (ok) await navigateTo('/inventory')
}
</script>

<template>
  <StockForm
    v-model:ingredient-id="ingredientId"
    :title="t('inventory.waste')"
    :valid="valid"
    :saving="saving"
    @submit="save"
  >
    <template #default="{ ingredient }">
      <UFormField :label="t('inventory.qty')" name="qty" required>
        <QtyInput v-model="qty" :unit="ingredient?.base_unit" />
      </UFormField>
      <UFormField :label="t('inventory.reason')" name="reason">
        <URadioGroup v-model="reason" :items="reasons" orientation="horizontal" />
      </UFormField>
      <UFormField :label="t('inventory.note')" name="note">
        <UInput v-model="note" :maxlength="150" class="w-full" />
      </UFormField>
    </template>
  </StockForm>
</template>
