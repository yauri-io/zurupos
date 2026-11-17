<script setup lang="ts">
// Owner home: today's numbers, refreshed every 60 s (SPEC §12.3). Managers land on /menu.
const { t } = useI18n()
const { can, me } = useAuth()
if (!can('reports.view')) await navigateTo('/menu', { replace: true })
useHead({ title: () => t('nav.home') })
const api = useApi()
const { today } = useRange()

const { data, refresh } = await useAsyncData('home', async () => {
  const query = { from: today.value, to: today.value }
  const [summary, items, payments, hourly] = await Promise.all([
    unwrap(api.GET('/v1/reports/summary', { params: { query } })),
    unwrap(api.GET('/v1/reports/items', { params: { query } })),
    unwrap(api.GET('/v1/reports/payments', { params: { query } })),
    unwrap(api.GET('/v1/reports/hourly', { params: { query } })),
  ])
  return { summary, items: items.items.slice(0, 5), payments, hours: hourly.hours }
})
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => void refresh(), 60_000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <PagePanel :title="t('nav.home')">
    <div v-if="data" class="flex flex-col gap-6">
      <p class="text-lg">{{ t('home.welcome', { name: me?.user.name ?? '' }) }}</p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="today">
        <StatCard :label="t('home.net_today')" :value="formatIdr(data.summary.net_sales)" />
        <StatCard :label="t('reports.orders')" :value="String(data.summary.orders)" />
        <StatCard :label="t('reports.aov')" :value="formatIdr(data.summary.average_order_value)" />
        <StatCard :label="t('reports.total_collected')" :value="formatIdr(data.summary.total_collected)" />
      </div>
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
      <div class="grid md:grid-cols-2 gap-6">
        <section>
          <h2 class="font-semibold mb-2">{{ t('home.top_items') }}</h2>
          <p v-if="data.items.length === 0" class="text-muted text-sm">{{ t('reports.empty') }}</p>
          <div v-for="i in data.items" :key="i.item_id" class="flex justify-between gap-2 py-1 text-sm">
            <span>{{ i.qty }}× {{ i.name }}</span>
            <span class="tabular-nums">{{ formatIdr(i.net_after_order_discount) }}</span>
          </div>
        </section>
        <section>
          <h2 class="font-semibold mb-2">{{ t('reports.payments') }}</h2>
          <p v-if="data.payments.methods.length === 0" class="text-muted text-sm">{{ t('reports.empty') }}</p>
          <div
            v-for="m in data.payments.methods"
            :key="`${m.method}-${m.provider}`"
            class="flex justify-between gap-2 py-1 text-sm"
          >
            <span
              >{{ t(`payment_methods.${m.method}`)
              }}<template v-if="m.provider"> · {{ m.provider }}</template></span
            >
            <span class="tabular-nums">{{ formatIdr(m.amount) }}</span>
          </div>
        </section>
      </div>
      <p class="text-xs text-muted">{{ t('home.refresh_note') }}</p>
    </div>
  </PagePanel>
</template>
