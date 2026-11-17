<script setup lang="ts">
definePageMeta({ permission: 'reports.view' })
const { t } = useI18n()
const api = useApi()
const { range, setRange, today } = useRange('last7')
useHead({ title: () => t('reports.items') })

const { data, pending, error } = await useAsyncData(
  'report-items',
  async () => {
    const query = range.value
    const [items, categories] = await Promise.all([
      unwrap(api.GET('/v1/reports/items', { params: { query } })),
      unwrap(api.GET('/v1/reports/categories', { params: { query } })),
    ])
    return { items: items.items, categories: categories.categories }
  },
  { watch: [range] },
)
const tab = ref('items')
const tabs = computed(() => [
  { label: t('reports.by_item'), value: 'items' },
  { label: t('reports.by_category'), value: 'categories' },
])
const rows = computed(() =>
  tab.value === 'items'
    ? (data.value?.items ?? []).map((i) => ({ ...i, key: i.item_id, sub: i.category_name }))
    : (data.value?.categories ?? []).map((c) => ({ key: c.name, sub: '', ...c })),
)
</script>

<template>
  <ReportShell
    :title="t('reports.items')"
    :range="range"
    :today="today"
    :pending="pending"
    :error="error"
    @range="setRange"
  >
    <UTabs v-model="tab" :items="tabs" :content="false" class="mb-3 max-w-sm" />
    <p v-if="rows.length === 0" class="text-muted">{{ t('reports.empty') }}</p>
    <div
      v-else
      class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md"
      data-testid="item-rows"
    >
      <div v-for="r in rows" :key="r.key" class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
        <div class="flex-1 min-w-40">
          <p class="font-medium">{{ r.name }}</p>
          <p v-if="r.sub" class="text-xs text-muted">{{ r.sub }}</p>
        </div>
        <span class="text-sm text-muted">{{ t('reports.qty_sold', { n: r.qty }) }}</span>
        <div class="text-right">
          <p class="tabular-nums font-medium">{{ formatIdr(r.net_after_order_discount) }}</p>
          <p class="text-xs text-muted tabular-nums">
            {{ t('reports.before_order_discount') }} {{ formatIdr(r.net_sales) }}
          </p>
        </div>
      </div>
    </div>
    <p class="text-xs text-muted mt-3">{{ t('reports.allocation_note') }}</p>
  </ReportShell>
</template>
