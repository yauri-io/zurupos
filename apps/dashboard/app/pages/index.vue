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
  const [summary, items, payments, hourly, voids, ingredients] = await Promise.all([
    unwrap(api.GET('/v1/reports/summary', { params: { query } })),
    unwrap(api.GET('/v1/reports/items', { params: { query } })),
    unwrap(api.GET('/v1/reports/payments', { params: { query } })),
    unwrap(api.GET('/v1/reports/hourly', { params: { query } })),
    unwrap(api.GET('/v1/reports/voids', { params: { query } })),
    unwrap(api.GET('/v1/ingredients')),
  ])
  // PRD §6 home: the low-stock list, negative stock first.
  const low = ingredients.ingredients
    .filter((i) => i.is_low || i.stock_qty.startsWith('-'))
    .sort((a, b) => Number(b.stock_qty.startsWith('-')) - Number(a.stock_qty.startsWith('-')))
  return {
    summary,
    items: items.items.slice(0, 5),
    payments,
    hours: hourly.hours,
    voids,
    low,
    ingredientCount: ingredients.ingredients.length,
  }
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
      <SetupChecklist :ingredients="data.ingredientCount" :today="today" />
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="today">
        <StatCard :label="t('home.net_today')" :value="formatIdr(data.summary.net_sales)" />
        <StatCard :label="t('reports.orders')" :value="String(data.summary.orders)" />
        <StatCard :label="t('reports.aov')" :value="formatIdr(data.summary.average_order_value)" />
        <StatCard :label="t('reports.total_collected')" :value="formatIdr(data.summary.total_collected)" />
      </div>
      <section data-testid="low-stock">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h2 class="font-semibold">{{ t('home.low_stock') }}</h2>
          <ULink to="/inventory" class="text-sm text-primary">{{ t('home.see_stock') }}</ULink>
        </div>
        <p v-if="data.low.length === 0" class="text-muted text-sm">{{ t('home.stock_ok') }}</p>
        <NuxtLink
          v-for="i in data.low.slice(0, 8)"
          :key="i.id"
          :to="`/inventory/${i.id}`"
          class="flex justify-between gap-2 py-1 text-sm hover:underline"
        >
          <span>
            {{ i.name }}
            <UBadge
              :color="i.stock_qty.startsWith('-') ? 'error' : 'warning'"
              variant="subtle"
              size="sm"
              :label="i.stock_qty.startsWith('-') ? t('inventory.negative') : t('ingredients.low')"
              class="ms-1"
            />
          </span>
          <span class="tabular-nums" :class="{ 'text-error': i.stock_qty.startsWith('-') }">
            {{ formatQty(i.stock_qty, i.base_unit) }}
          </span>
        </NuxtLink>
        <p v-if="data.low.length > 8" class="text-xs text-muted">
          {{ t('home.more_low', { count: data.low.length - 8 }) }}
        </p>
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
      <NuxtLink to="/reports/voids" class="text-sm hover:underline" data-testid="voids-today">
        {{ t('home.voids_today', { count: data.voids.count, total: formatIdr(data.voids.total) }) }}
      </NuxtLink>
      <p class="text-xs text-muted">{{ t('home.refresh_note') }}</p>
    </div>
  </PagePanel>
</template>
