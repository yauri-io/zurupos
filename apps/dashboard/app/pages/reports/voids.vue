<script setup lang="ts">
definePageMeta({ permission: 'reports.view' })
const { t, locale } = useI18n()
const api = useApi()
const { me } = useAuth()
const { range, setRange, today } = useRange('last7')
useHead({ title: () => t('reports.voids') })

const { data, pending, error } = await useAsyncData(
  'report-voids',
  () => unwrap(api.GET('/v1/reports/voids', { params: { query: range.value } })),
  { watch: [range] },
)
const tz = computed(() => me.value?.tenant.timezone ?? 'Asia/Jakarta')
</script>

<template>
  <ReportShell
    :title="t('reports.voids')"
    :range="range"
    :today="today"
    :pending="pending"
    :error="error"
    @range="setRange"
  >
    <div v-if="data" class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3 max-w-md">
        <StatCard :label="t('reports.void_count')" :value="String(data.count)" />
        <StatCard :label="t('reports.void_total')" :value="formatIdr(data.total)" />
      </div>
      <p v-if="data.orders.length === 0" class="text-muted">{{ t('reports.empty') }}</p>
      <div
        v-else
        class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md"
        data-testid="voids"
      >
        <NuxtLink
          v-for="o in data.orders"
          :key="o.id"
          :to="`/orders/${o.id}`"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 hover:bg-elevated"
        >
          <div class="flex-1 min-w-48">
            <p class="font-medium">#{{ o.order_number }} · {{ formatDay(o.business_date, locale) }}</p>
            <p class="text-sm">{{ o.reason }}</p>
            <p class="text-xs text-muted">
              {{
                t('reports.voided_by', {
                  name: o.voided_by.name,
                  at: formatDateTime(o.voided_at, tz, locale),
                })
              }}
              <template v-if="o.approved_by">
                · {{ t('reports.approved_by', { name: o.approved_by.name }) }}</template
              >
              · {{ o.restock ? t('reports.restocked') : t('reports.not_restocked') }}
            </p>
          </div>
          <span class="tabular-nums">{{ formatIdr(o.total) }}</span>
        </NuxtLink>
      </div>
    </div>
  </ReportShell>
</template>
