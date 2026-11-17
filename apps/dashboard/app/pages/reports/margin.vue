<script setup lang="ts">
definePageMeta({ permission: 'costs.view' })
const { t } = useI18n()
const api = useApi()
const { range, setRange, today } = useRange('last7')
useHead({ title: () => t('reports.margin') })

const { data, pending, error } = await useAsyncData(
  'report-margin',
  async () => {
    const [margin, stock] = await Promise.all([
      unwrap(api.GET('/v1/reports/margin', { params: { query: range.value } })),
      unwrap(api.GET('/v1/reports/stock-value')),
    ])
    return { margin, stock }
  },
  { watch: [range] },
)
const pct = (bps: number | null) => (bps === null ? '–' : formatBps(bps))
</script>

<template>
  <ReportShell
    :title="t('reports.margin')"
    :range="range"
    :today="today"
    :pending="pending"
    :error="error"
    @range="setRange"
  >
    <div v-if="data" class="flex flex-col gap-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="margin">
        <StatCard :label="t('reports.net_sales')" :value="formatIdr(data.margin.net_sales)" />
        <StatCard :label="t('reports.cogs')" :value="formatIdr(data.margin.cogs)" />
        <StatCard :label="t('reports.gross_margin')" :value="formatIdr(data.margin.gross_margin)" />
        <StatCard :label="t('reports.margin_pct')" :value="pct(data.margin.margin_bps)" />
      </div>
      <section>
        <h2 class="font-semibold mb-2">{{ t('reports.by_item') }}</h2>
        <p v-if="data.margin.items.length === 0" class="text-muted">{{ t('reports.empty') }}</p>
        <div v-else class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md">
          <div
            v-for="i in data.margin.items"
            :key="i.item_id"
            class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3"
          >
            <p class="flex-1 min-w-40 font-medium">{{ i.name }}</p>
            <span class="text-sm text-muted tabular-nums"
              >{{ t('reports.cogs') }} {{ formatIdr(i.cogs) }}</span
            >
            <div class="text-right">
              <p class="tabular-nums font-medium">{{ formatIdr(i.gross_margin) }}</p>
              <p class="text-xs text-muted">{{ pct(i.margin_bps) }}</p>
            </div>
          </div>
        </div>
      </section>
      <section>
        <h2 class="font-semibold mb-2">{{ t('reports.stock_value') }}: {{ formatIdr(data.stock.total) }}</h2>
        <p class="text-xs text-muted mb-2">{{ t('reports.stock_value_note') }}</p>
        <div class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md">
          <div
            v-for="i in data.stock.ingredients"
            :key="i.id"
            class="flex flex-wrap justify-between gap-2 p-2 text-sm"
          >
            <span>{{ i.name }}</span>
            <span class="text-muted tabular-nums">{{ formatQty(i.stock_qty, i.base_unit) }}</span>
            <span class="tabular-nums">{{ formatIdr(i.value) }}</span>
          </div>
        </div>
      </section>
    </div>
  </ReportShell>
</template>
