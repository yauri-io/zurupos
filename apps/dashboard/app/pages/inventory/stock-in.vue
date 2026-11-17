<script setup lang="ts">
// SPEC §7.4 stock-in: base or purchase units, total cost → weighted average cost.
definePageMeta({ permission: 'stock.adjust' })
const { t } = useI18n()
const api = useApi()
const run = useAction()
useHead({ title: () => t('inventory.stock_in') })

const ingredientId = ref<string>()
const usePurchase = ref(false)
const qty = ref<string | null>(null)
const cost = ref<number | null>(null)
const saving = ref(false)
const valid = computed(() => !!ingredientId.value && !!qty.value && qty.value !== '0' && cost.value !== null)
const save = async () => {
  const id = ingredientId.value
  if (!id || !qty.value || cost.value === null) return
  saving.value = true
  const body = usePurchase.value
    ? { ingredient_id: id, purchase_qty: qty.value, total_cost: cost.value }
    : { ingredient_id: id, qty: qty.value, total_cost: cost.value }
  const ok = await run(() => unwrap(api.POST('/v1/stock/in', { body })))
  saving.value = false
  if (ok) await navigateTo('/inventory')
}
</script>

<template>
  <StockForm
    v-model:ingredient-id="ingredientId"
    :title="t('inventory.stock_in')"
    :valid="valid"
    :saving="saving"
    @submit="save"
  >
    <template #default="{ ingredient }">
      <USwitch
        v-if="ingredient?.purchase_unit_name && ingredient.purchase_unit_size"
        v-model="usePurchase"
        :label="
          t('inventory.use_purchase_unit', {
            name: ingredient.purchase_unit_name,
            size: formatQty(ingredient.purchase_unit_size, ingredient.base_unit),
          })
        "
      />
      <UFormField :label="t('inventory.qty')" name="qty" required>
        <QtyInput
          v-model="qty"
          :unit="usePurchase ? (ingredient?.purchase_unit_name ?? '') : ingredient?.base_unit"
        />
      </UFormField>
      <UFormField
        :label="t('inventory.total_cost')"
        :help="t('inventory.total_cost_help')"
        name="cost"
        required
      >
        <MoneyInput v-model="cost" />
      </UFormField>
    </template>
  </StockForm>
</template>
