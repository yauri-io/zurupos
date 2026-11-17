<script setup lang="ts">
// Stock levels (SPEC §12.3): low/negative badges, links to movements and stock actions.
definePageMeta({ permission: 'stock.adjust' })
const { t } = useI18n()
const api = useApi()
const { can } = useAuth()
useHead({ title: () => t('nav.inventory') })

const ingredients = (await unwrap(api.GET('/v1/ingredients'))).ingredients
const stock = can('costs.view') ? await unwrap(api.GET('/v1/reports/stock-value')) : null
const valueOf = (id: string) => stock?.ingredients.find((i) => i.id === id)?.value
const search = ref('')
const filter = ref<'all' | 'low'>('all')
const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return ingredients
    .filter((i) => !q || i.name.toLowerCase().includes(q))
    .filter((i) => filter.value === 'all' || i.is_low || i.stock_qty.startsWith('-'))
})
const filterItems = computed(() => [
  { value: 'all' as const, label: t('inventory.all') },
  { value: 'low' as const, label: t('inventory.low_or_negative') },
])
</script>

<template>
  <PagePanel :title="t('nav.inventory')">
    <template #actions>
      <div class="flex flex-wrap gap-2">
        <UButton to="/inventory/stock-in" icon="i-lucide-package-plus" :label="t('inventory.stock_in')" />
        <UButton to="/inventory/waste" icon="i-lucide-trash-2" variant="soft" :label="t('inventory.waste')" />
        <UButton
          to="/inventory/count"
          icon="i-lucide-clipboard-check"
          variant="soft"
          :label="t('inventory.count')"
        />
      </div>
    </template>
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-2">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="t('common.search')"
          class="w-full sm:w-64"
        />
        <USelect v-model="filter" :items="filterItems" class="w-48" />
      </div>
      <p v-if="stock" class="text-sm">
        {{ t('reports.stock_value') }}: <span class="font-semibold">{{ formatIdr(stock.total) }}</span>
      </p>
      <p v-if="shown.length === 0" class="text-muted text-center py-12">{{ t('ingredients.empty') }}</p>
      <div
        v-else
        class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md"
        data-testid="levels"
      >
        <NuxtLink
          v-for="i in shown"
          :key="i.id"
          :to="`/inventory/${i.id}`"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 hover:bg-elevated"
        >
          <div class="flex-1 min-w-40">
            <p class="font-medium">
              {{ i.name }}
              <UBadge
                v-if="i.stock_qty.startsWith('-')"
                color="error"
                variant="subtle"
                size="sm"
                :label="t('inventory.negative')"
                class="ms-1"
              />
              <UBadge
                v-else-if="i.is_low"
                color="warning"
                variant="subtle"
                size="sm"
                :label="t('ingredients.low')"
                class="ms-1"
              />
            </p>
            <p class="text-xs text-muted">
              {{ t('ingredients.threshold') }}: {{ formatQty(i.low_stock_threshold, i.base_unit) }}
            </p>
          </div>
          <div class="text-right">
            <p class="tabular-nums" :class="{ 'text-error': i.stock_qty.startsWith('-') }">
              {{ formatQty(i.stock_qty, i.base_unit) }}
            </p>
            <p v-if="valueOf(i.id) !== undefined" class="text-xs text-muted tabular-nums">
              {{ formatIdr(valueOf(i.id) ?? 0) }}
            </p>
          </div>
        </NuxtLink>
      </div>
    </div>
  </PagePanel>
</template>
