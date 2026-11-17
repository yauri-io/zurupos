<script setup lang="ts">
// Owner order history (SPEC §12.3): range, status, method, text search; "load more" pages.
definePageMeta({ permission: 'orders.view_all' })
const { t, locale } = useI18n()
const api = useApi()
const { me } = useAuth()
const { range, setRange, today } = useRange('today')
useHead({ title: () => t('nav.orders') })

const status = ref<'all' | 'paid' | 'voided'>('all')
const method = ref<'all' | 'cash' | 'qris' | 'debit' | 'credit' | 'transfer' | 'other'>('all')
const q = ref('')
const orders = ref<OrderListItem[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const tz = computed(() => me.value?.tenant.timezone ?? 'Asia/Jakarta')

const fetchPage = async (reset: boolean) => {
  loading.value = true
  try {
    const page = await unwrap(
      api.GET('/v1/orders', {
        params: {
          query: {
            ...range.value,
            ...(status.value !== 'all' ? { status: status.value } : {}),
            ...(method.value !== 'all' ? { method: method.value } : {}),
            ...(q.value.trim() ? { q: q.value.trim() } : {}),
            ...(!reset && cursor.value ? { cursor: cursor.value } : {}),
          },
        },
      }),
    )
    orders.value = reset ? page.orders : [...orders.value, ...page.orders]
    cursor.value = page.next_cursor
  } finally {
    loading.value = false
  }
}
await fetchPage(true)
watch([range, status, method], () => fetchPage(true))
let debounce: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => void fetchPage(true), 300)
})

const statusItems = computed(() =>
  (['all', 'paid', 'voided'] as const).map((value) => ({ value, label: t(`orders.status_${value}`) })),
)
const methodItems = computed(() => [
  { value: 'all' as const, label: t('orders.all_methods') },
  ...(['cash', 'qris', 'debit', 'credit', 'transfer', 'other'] as const).map((value) => ({
    value,
    label: t(`payment_methods.${value}`),
  })),
])
</script>

<template>
  <PagePanel :title="t('nav.orders')">
    <div class="flex flex-col gap-3">
      <DateRangePicker :model-value="range" :today="today" @update:model-value="setRange" />
      <div class="flex flex-wrap gap-2">
        <USelect v-model="status" :items="statusItems" class="w-36" />
        <USelect v-model="method" :items="methodItems" class="w-40" />
        <UInput v-model="q" icon="i-lucide-search" :placeholder="t('orders.search')" class="w-full sm:w-64" />
      </div>
      <p v-if="orders.length === 0 && !loading" class="text-muted text-center py-12">
        {{ t('orders.empty') }}
      </p>
      <div
        v-else
        class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md"
        data-testid="orders"
      >
        <NuxtLink
          v-for="o in orders"
          :key="o.id"
          :to="`/orders/${o.id}`"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 hover:bg-elevated"
        >
          <div class="flex-1 min-w-48">
            <p class="font-medium">
              #{{ o.order_number }}
              <span class="text-muted font-normal">· {{ formatDateTime(o.paid_at, tz, locale) }}</span>
              <UBadge
                v-if="o.status === 'voided'"
                color="error"
                variant="subtle"
                size="sm"
                :label="t('orders.voided')"
                class="ms-1"
              />
            </p>
            <p class="text-sm text-muted truncate">
              <template v-if="o.customer_name">{{ o.customer_name }} · </template>
              {{ o.items.map((i) => `${i.qty}× ${i.name}`).join(', ') }}
            </p>
            <p class="text-xs text-muted">
              {{ o.created_by.name }} ·
              {{ (o.payment_methods ?? []).map((m) => t(`payment_methods.${m}`)).join(' + ') }}
            </p>
          </div>
          <span
            class="tabular-nums font-medium"
            :class="{ 'line-through text-muted': o.status === 'voided' }"
          >
            {{ formatIdr(o.total) }}
          </span>
        </NuxtLink>
      </div>
      <UButton
        v-if="cursor"
        :loading="loading"
        variant="outline"
        class="self-center"
        :label="t('orders.load_more')"
        @click="fetchPage(false)"
      />
    </div>
  </PagePanel>
</template>
