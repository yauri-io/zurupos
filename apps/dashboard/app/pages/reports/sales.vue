<script setup lang="ts">
definePageMeta({ permission: 'reports.view' })
const { t, locale } = useI18n()
const api = useApi()
const { range, setRange, today } = useRange('last7')
useHead({ title: () => t('reports.sales') })

const { data, pending, error } = await useAsyncData(
  'report-sales',
  async () => {
    const query = range.value
    const [summary, daily, hourly] = await Promise.all([
      unwrap(api.GET('/v1/reports/summary', { params: { query } })),
      unwrap(api.GET('/v1/reports/daily', { params: { query } })),
      unwrap(api.GET('/v1/reports/hourly', { params: { query } })),
    ])
    return { summary, days: daily.days, hours: hourly.hours }
  },
  { watch: [range] },
)
const cards = computed(() => {
  const s = data.value?.summary
  if (!s) return []
  return [
    { label: t('reports.gross_sales'), value: formatIdr(s.gross_sales) },
    { label: t('reports.discounts'), value: formatIdr(s.discounts) },
    { label: t('reports.net_sales'), value: formatIdr(s.net_sales) },
    { label: t('reports.service_charge'), value: formatIdr(s.service_charge) },
    { label: t('reports.tax'), value: formatIdr(s.tax) },
    { label: t('reports.total_collected'), value: formatIdr(s.total_collected) },
    { label: t('reports.orders'), value: String(s.orders) },
    { label: t('reports.aov'), value: formatIdr(s.average_order_value) },
  ]
})
</script>

<template>
  <ReportShell
    :title="t('reports.sales')"
    :range="range"
    :today="today"
    :pending="pending"
    :error="error"
    @range="setRange"
  >
    <div v-if="data" class="flex flex-col gap-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="summary">
        <StatCard v-for="c in cards" :key="c.label" :label="c.label" :value="c.value" />
      </div>
      <section>
        <h2 class="font-semibold mb-2">{{ t('reports.daily') }}</h2>
        <BarChart
          :points="
            data.days.map((d) => ({
              label: formatDay(d.business_date, locale).replace(/ \d{4}$/, ''),
              value: d.net_sales,
            }))
          "
          :format="formatIdr"
        />
        <div class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md mt-2">
          <div
            v-for="d in data.days"
            :key="d.business_date"
            class="flex flex-wrap justify-between gap-2 p-2 text-sm"
          >
            <span>{{ formatDay(d.business_date, locale) }}</span>
            <span class="text-muted">{{ t('reports.n_orders', { n: d.orders }) }}</span>
            <span class="tabular-nums font-medium">{{ formatIdr(d.net_sales) }}</span>
          </div>
        </div>
      </section>
      <section>
        <h2 class="font-semibold mb-2">{{ t('reports.hourly') }}</h2>
        <BarChart
          :points="
            data.hours
              .filter((h) => h.hour >= 5)
              .map((h) => ({ label: String(h.hour).padStart(2, '0'), value: h.net_sales }))
          "
          :format="formatIdr"
        />
      </section>
      <p class="text-xs text-muted">{{ t('reports.net_note') }}</p>
    </div>
  </ReportShell>
</template>
