<script setup lang="ts">
import { rangeDays, WEEK_PRESETS } from '../../utils/dates'
import { formatTenths, hourLabel, hourSpan, shader, SHADES, weekdayName } from '../../utils/heatmap'

// Operational heatmap (SPEC §12.4, PRD F15): average orders or net sales per
// weekday × hour. The API computes every number; this page only shades them.
definePageMeta({ permission: 'reports.view' })
const { t, locale } = useI18n()
const api = useApi()
const { range, setRange, today } = useRange('weeks4')
useHead({ title: () => t('heatmap.title') })

const MAX_DAYS = 92
const tooLong = computed(() => rangeDays(range.value) > MAX_DAYS)

const { data, pending, error } = await useAsyncData(
  'report-heatmap',
  () =>
    tooLong.value
      ? Promise.resolve(null)
      : unwrap(api.GET('/v1/reports/heatmap', { params: { query: range.value } })),
  { watch: [range] },
)

type Metric = 'orders' | 'net_sales'
const metric = ref<Metric>('orders')
const metrics = computed(() => [
  { label: t('heatmap.metric_orders'), value: 'orders' as const },
  { label: t('heatmap.metric_net_sales'), value: 'net_sales' as const },
])

type Cell = { hour: number; orders: number; net_sales: number; avg_orders_x10: number; avg_net_sales: number }
const avgOf = (c: Cell) => (metric.value === 'orders' ? c.avg_orders_x10 : c.avg_net_sales)
const shade = computed(() =>
  shader((data.value?.weekdays ?? []).flatMap((w) => w.cells.map((c) => (c ? avgOf(c) : 0)))),
)
const hasOrders = computed(() => (data.value?.hours.length ?? 0) > 0)

const where = (weekday: number, hour: number) =>
  `${weekdayName(weekday, locale.value)} ${hourSpan(hour, locale.value)}`

const sentence = computed(() => {
  const i = data.value?.insight[metric.value]
  if (!i) return null
  const params = {
    busiest: where(i.busiest.weekday, i.busiest.hour),
    quietest: where(i.quietest.weekday, i.quietest.hour),
    ratio: i.ratio,
  }
  return i.ratio === null
    ? t(`heatmap.insight_${metric.value}`, params)
    : t(`heatmap.insight_${metric.value}_ratio`, params)
})

// The cell whose numbers are shown under the grid (tap or focus a cell).
const picked = ref<{ weekday: number; tradingDays: number; cell: Cell } | null>(null)
watch(data, () => (picked.value = null))
const cellLabel = (weekday: number, days: number, c: Cell) =>
  t('heatmap.cell', {
    where: where(weekday, c.hour),
    orders: formatTenths(c.avg_orders_x10, locale.value),
    net: formatIdr(c.avg_net_sales),
    days,
    weekday: weekdayName(weekday, locale.value),
  })

// Shades of the primary colour; only the darkest carries inverted text.
const MIX = [0, 20, 40, 60, 85]
const shadeStyle = (level: number) =>
  level === 0 ? {} : { backgroundColor: `color-mix(in oklab, var(--ui-primary) ${MIX[level]}%, transparent)` }
</script>

<template>
  <ReportShell
    :title="t('heatmap.title')"
    :range="range"
    :today="today"
    :pending="pending"
    :error="error"
    :presets="WEEK_PRESETS"
    @range="setRange"
  >
    <p v-if="tooLong" class="text-error" data-testid="heatmap-too-long">
      {{ t('heatmap.too_long', { n: MAX_DAYS }) }}
    </p>
    <div v-else-if="data" class="flex flex-col gap-4 min-w-0">
      <p v-if="!hasOrders" class="text-muted">{{ t('reports.empty') }}</p>
      <template v-else>
        <UAlert
          v-if="!data.reliable"
          color="neutral"
          variant="soft"
          icon="i-lucide-info"
          :title="t('heatmap.unreliable', { n: data.weeks_of_data }, data.weeks_of_data)"
          :description="t('heatmap.unreliable_hint')"
          data-testid="heatmap-unreliable"
        />
        <div class="flex flex-wrap items-center gap-3">
          <UTabs v-model="metric" :items="metrics" :content="false" size="sm" data-testid="heatmap-metric" />
        </div>
        <p v-if="sentence" class="font-medium" data-testid="heatmap-insight">{{ sentence }}</p>

        <!-- The grid scrolls sideways inside its card; the weekday column stays put. -->
        <div class="overflow-x-auto border border-default rounded-md" data-testid="heatmap">
          <table class="border-separate border-spacing-0.5 text-xs tabular-nums">
            <thead>
              <tr>
                <th class="sticky left-0 z-10 bg-default" scope="col">
                  <span class="sr-only">{{ t('heatmap.weekday') }}</span>
                </th>
                <th
                  v-for="h in data.hours"
                  :key="h"
                  scope="col"
                  class="px-1 py-1 font-normal text-muted min-w-10"
                >
                  {{ hourLabel(h, locale) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in data.weekdays" :key="w.weekday">
                <th
                  scope="row"
                  class="sticky left-0 z-10 bg-default text-left font-medium pr-2 pl-2 whitespace-nowrap"
                >
                  {{ weekdayName(w.weekday, locale, 'short') }}
                  <span class="block font-normal text-muted">
                    {{
                      w.trading_days > 0 ? t('heatmap.based_on', { n: w.trading_days }) : t('heatmap.no_data')
                    }}
                  </span>
                </th>
                <td v-for="(c, i) in w.cells" :key="data.hours[i]" class="p-0">
                  <button
                    v-if="c"
                    type="button"
                    class="h-9 w-full min-w-10 rounded-sm text-center focus-visible:outline-2 focus-visible:outline-(--ui-primary)"
                    :class="[
                      shade(avgOf(c)) === 0 ? 'bg-elevated text-dimmed' : '',
                      shade(avgOf(c)) === SHADES ? 'text-inverted font-semibold' : '',
                    ]"
                    :style="shadeStyle(shade(avgOf(c)))"
                    :aria-label="cellLabel(w.weekday, w.trading_days, c)"
                    @click="picked = { weekday: w.weekday, tradingDays: w.trading_days, cell: c }"
                    @focus="picked = { weekday: w.weekday, tradingDays: w.trading_days, cell: c }"
                  >
                    <template v-if="metric === 'orders' && c.avg_orders_x10 > 0">
                      {{ formatTenths(c.avg_orders_x10, locale) }}
                    </template>
                  </button>
                  <div v-else class="h-9 w-full min-w-10 rounded-sm bg-muted opacity-40" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{{ t('heatmap.legend_low') }}</span>
          <span
            v-for="level in SHADES"
            :key="level"
            class="inline-block size-4 rounded-sm"
            :style="shadeStyle(level)"
          />
          <span>{{ t('heatmap.legend_high') }}</span>
        </div>

        <p class="text-sm min-h-5" aria-live="polite" data-testid="heatmap-picked">
          <template v-if="picked">
            {{ cellLabel(picked.weekday, picked.tradingDays, picked.cell) }}
          </template>
          <span v-else class="text-muted">{{ t('heatmap.pick_hint') }}</span>
        </p>
        <p class="text-xs text-muted">{{ t('heatmap.note') }}</p>
      </template>
    </div>
  </ReportShell>
</template>
