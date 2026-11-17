<script setup lang="ts">
definePageMeta({ permission: 'reports.view' })
const { t } = useI18n()
const api = useApi()
const { range, setRange, today } = useRange('today')
useHead({ title: () => t('reports.payments') })

const { data, pending, error } = await useAsyncData(
  'report-payments',
  () => unwrap(api.GET('/v1/reports/payments', { params: { query: range.value } })),
  { watch: [range] },
)
</script>

<template>
  <ReportShell
    :title="t('reports.payments')"
    :range="range"
    :today="today"
    :pending="pending"
    :error="error"
    @range="setRange"
  >
    <div v-if="data" class="flex flex-col gap-4 max-w-2xl">
      <StatCard :label="t('reports.total_collected')" :value="formatIdr(data.total)" />
      <p v-if="data.methods.length === 0" class="text-muted">{{ t('reports.empty') }}</p>
      <div
        v-else
        class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md"
        data-testid="methods"
      >
        <div
          v-for="m in data.methods"
          :key="`${m.method}-${m.provider}`"
          class="flex flex-wrap justify-between gap-2 p-3"
        >
          <span class="font-medium">
            {{ t(`payment_methods.${m.method}`)
            }}<span v-if="m.provider" class="text-muted"> · {{ m.provider }}</span>
          </span>
          <span class="text-muted text-sm">{{ t('reports.n_payments', { n: m.count }) }}</span>
          <span class="tabular-nums">{{ formatIdr(m.amount) }}</span>
        </div>
      </div>
    </div>
  </ReportShell>
</template>
