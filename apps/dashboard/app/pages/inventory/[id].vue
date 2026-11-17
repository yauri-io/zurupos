<script setup lang="ts">
// One ingredient's movements, newest first (SPEC §12.3), paged with "load more".
definePageMeta({ permission: 'stock.adjust' })
const { t, locale } = useI18n()
const api = useApi()
const route = useRoute()
const { me } = useAuth()
const id = String(route.params.id)
const ingredient = (await unwrap(api.GET('/v1/ingredients'))).ingredients.find((i) => i.id === id)
if (!ingredient) throw createError({ statusCode: 404 })
useHead({ title: () => ingredient.name })
const tz = computed(() => me.value?.tenant.timezone ?? 'Asia/Jakarta')

const movements = ref<Movement[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const more = async () => {
  loading.value = true
  try {
    const page = await unwrap(
      api.GET('/v1/ingredients/{id}/movements', {
        params: { path: { id }, query: cursor.value ? { cursor: cursor.value } : {} },
      }),
    )
    movements.value.push(...page.movements)
    cursor.value = page.next_cursor
  } finally {
    loading.value = false
  }
}
await more()
const signed = (qty: string, unit: string) => `${qty.startsWith('-') ? '' : '+'}${formatQty(qty, unit)}`
</script>

<template>
  <PagePanel :title="ingredient.name">
    <template #actions>
      <UButton
        to="/inventory"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        :label="t('nav.inventory')"
      />
    </template>
    <div class="flex flex-col gap-3 max-w-3xl">
      <p class="text-lg">
        {{ t('inventory.on_hand') }}:
        <span class="font-semibold tabular-nums">{{
          formatQty(ingredient.stock_qty, ingredient.base_unit)
        }}</span>
      </p>
      <p v-if="movements.length === 0" class="text-muted">{{ t('inventory.no_movements') }}</p>
      <div
        v-else
        class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md"
        data-testid="movements"
      >
        <div v-for="m in movements" :key="m.id" class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
          <div class="flex-1 min-w-48">
            <p class="font-medium">
              {{ t(`inventory.type_${m.type}`) }}
              <NuxtLink v-if="m.order_id" :to="`/orders/${m.order_id}`" class="text-primary text-sm ms-1">
                {{ t('inventory.view_order') }}
              </NuxtLink>
            </p>
            <p class="text-xs text-muted">
              {{ formatDateTime(m.created_at, tz, locale) }} · {{ m.created_by.name }}
              <template v-if="m.reason"> · {{ m.reason }}</template>
              <template v-if="m.counted_qty !== null">
                · {{ t('inventory.counted', { qty: formatQty(m.counted_qty, ingredient.base_unit) }) }}
              </template>
            </p>
          </div>
          <div class="text-right">
            <p class="tabular-nums" :class="m.qty_delta.startsWith('-') ? 'text-error' : 'text-success'">
              {{ signed(m.qty_delta, ingredient.base_unit) }}
            </p>
            <p class="text-xs text-muted tabular-nums">
              {{ t('inventory.balance') }} {{ formatQty(m.balance_after, ingredient.base_unit) }}
            </p>
            <p
              v-if="m.total_cost !== undefined && m.total_cost !== null"
              class="text-xs text-muted tabular-nums"
            >
              {{ formatIdr(m.total_cost) }}
            </p>
          </div>
        </div>
      </div>
      <UButton
        v-if="cursor"
        :loading="loading"
        variant="outline"
        class="self-center"
        :label="t('orders.load_more')"
        @click="more"
      />
    </div>
  </PagePanel>
</template>
