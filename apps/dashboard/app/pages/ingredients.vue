<script setup lang="ts">
definePageMeta({ permission: 'menu.manage' })
const { t } = useI18n()
const api = useApi()
const run = useAction()
const { can } = useAuth()
useHead({ title: () => t('nav.ingredients') })

const ingredients = ref<Ingredient[]>([])
const load = async () => {
  ingredients.value = (await unwrap(api.GET('/v1/ingredients'))).ingredients
}
await load()
const showCosts = computed(() => can('costs.view'))
const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? ingredients.value.filter((i) => i.name.toLowerCase().includes(q)) : ingredients.value
})

const open = ref(false)
const form = reactive({
  id: null as string | null,
  name: '',
  base_unit: 'g' as 'g' | 'ml' | 'pcs',
  low_stock_threshold: '0' as string | null,
  purchase_unit_name: '',
  purchase_unit_size: null as string | null,
})
const edit = (i?: Ingredient) => {
  Object.assign(
    form,
    i
      ? {
          id: i.id,
          name: i.name,
          base_unit: i.base_unit,
          low_stock_threshold: i.low_stock_threshold,
          purchase_unit_name: i.purchase_unit_name ?? '',
          purchase_unit_size: i.purchase_unit_size,
        }
      : {
          id: null,
          name: '',
          base_unit: 'g',
          low_stock_threshold: '0',
          purchase_unit_name: '',
          purchase_unit_size: null,
        },
  )
  open.value = true
}
const purchaseValid = computed(
  () => (form.purchase_unit_name.trim() === '') === (form.purchase_unit_size === null),
)
const save = async () => {
  if (form.low_stock_threshold === null || !purchaseValid.value) return
  const unitName = form.purchase_unit_name.trim()
  const common = {
    name: form.name,
    low_stock_threshold: form.low_stock_threshold,
    purchase_unit_name: unitName === '' ? null : unitName,
    purchase_unit_size: unitName === '' ? null : form.purchase_unit_size,
  }
  const { id } = form
  const ok = await run(() =>
    id
      ? unwrap(api.PATCH('/v1/ingredients/{id}', { params: { path: { id } }, body: common }))
      : unwrap(api.POST('/v1/ingredients', { body: { ...common, base_unit: form.base_unit } })),
  )
  if (ok) {
    open.value = false
    await load()
  }
}
const archive = async (i: Ingredient) => {
  if (!confirm(t('ingredients.confirm_archive', { name: i.name }))) return
  if (
    await run(() => unwrap(api.DELETE('/v1/ingredients/{id}', { params: { path: { id: i.id } } })), {
      success: t('common.archived'),
    })
  ) {
    await load()
  }
}
const unitItems = computed(() =>
  (['g', 'ml', 'pcs'] as const).map((value) => ({ label: t(`units.${value}`), value })),
)
</script>

<template>
  <PagePanel :title="t('nav.ingredients')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('ingredients.add')" @click="edit()" />
    </template>

    <UInput
      v-model="search"
      icon="i-lucide-search"
      :placeholder="t('common.search')"
      class="mb-4 w-full sm:w-72"
    />
    <EmptyState
      v-if="ingredients.length === 0"
      icon="i-lucide-package"
      :title="t('ingredients.empty_title')"
      :description="t('ingredients.empty_help')"
    >
      <UButton icon="i-lucide-plus" :label="t('ingredients.add')" @click="edit()" />
    </EmptyState>
    <div
      v-else
      class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md"
      data-testid="ingredients"
    >
      <div v-for="i in filtered" :key="i.id" class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
        <div class="flex-1 min-w-40">
          <p class="font-medium">
            {{ i.name }}
            <UBadge
              v-if="i.is_low"
              color="warning"
              variant="subtle"
              size="sm"
              :label="t('ingredients.low')"
              class="ms-1"
            />
          </p>
          <p class="text-xs text-muted">
            {{ t('ingredients.threshold') }}: {{ formatQty(i.low_stock_threshold, i.base_unit) }}
            <template v-if="i.purchase_unit_name && i.purchase_unit_size">
              · 1 {{ i.purchase_unit_name }} = {{ formatQty(i.purchase_unit_size, i.base_unit) }}
            </template>
          </p>
        </div>
        <div class="text-right">
          <p class="tabular-nums" :class="{ 'text-error': i.stock_qty.startsWith('-') }">
            {{ formatQty(i.stock_qty, i.base_unit) }}
          </p>
          <p v-if="showCosts && i.avg_cost !== undefined" class="text-xs text-muted tabular-nums">
            {{ t('ingredients.avg_cost') }}: {{ formatQty(i.avg_cost) }} / {{ i.base_unit }}
            <HelpTip :text="t('help.avg_cost')" />
          </p>
        </div>
        <UButton
          icon="i-lucide-pencil"
          variant="ghost"
          color="neutral"
          :aria-label="t('common.edit')"
          @click="edit(i)"
        />
        <UButton
          icon="i-lucide-archive"
          variant="ghost"
          color="error"
          :aria-label="t('common.archive')"
          @click="archive(i)"
        />
      </div>
    </div>
    <p class="text-xs text-muted mt-4">{{ t('ingredients.stock_note') }}</p>

    <UModal v-model:open="open" :title="form.id ? t('ingredients.edit') : t('ingredients.add')">
      <template #body>
        <UForm id="ingredient-form" :state="form" class="flex flex-col gap-4" @submit="save">
          <UFormField :label="t('common.name')" name="name" required>
            <UInput v-model="form.name" class="w-full" autofocus />
          </UFormField>
          <UFormField
            :label="t('ingredients.base_unit')"
            :help="form.id ? t('ingredients.unit_fixed') : t('ingredients.unit_help')"
            name="base_unit"
          >
            <template #hint><HelpTip :text="t('help.base_unit')" /></template>
            <USelect v-model="form.base_unit" :items="unitItems" :disabled="!!form.id" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('ingredients.threshold')"
            :help="t('ingredients.threshold_help')"
            name="low_stock_threshold"
          >
            <QtyInput v-model="form.low_stock_threshold" :unit="form.base_unit" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField
              :label="t('ingredients.purchase_unit')"
              :help="t('ingredients.purchase_unit_help')"
              name="purchase_unit_name"
            >
              <template #hint><HelpTip :text="t('help.purchase_unit')" /></template>
              <UInput v-model="form.purchase_unit_name" class="w-full" />
            </UFormField>
            <UFormField
              :label="t('ingredients.purchase_unit_size')"
              name="purchase_unit_size"
              :error="purchaseValid ? undefined : t('ingredients.purchase_pair')"
            >
              <QtyInput v-model="form.purchase_unit_size" :unit="form.base_unit" />
            </UFormField>
          </div>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="ingredient-form"
          :label="t('common.save')"
          :disabled="!form.name.trim() || form.low_stock_threshold === null || !purchaseValid"
        />
      </template>
    </UModal>
  </PagePanel>
</template>
