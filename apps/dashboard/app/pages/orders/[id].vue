<script setup lang="ts">
definePageMeta({ permission: 'orders.view_all' })
const { t, locale } = useI18n()
const api = useApi()
const route = useRoute()
const { me } = useAuth()
const order = await unwrap(api.GET('/v1/orders/{id}', { params: { path: { id: String(route.params.id) } } }))
useHead({ title: () => `#${order.order_number}` })
const tz = computed(() => me.value?.tenant.timezone ?? 'Asia/Jakarta')
const discountLabel = (d: { name: string | null; kind: string; value: number }) =>
  d.name ?? `${t('orders.custom_discount')} ${d.kind === 'percent' ? formatBps(d.value) : formatIdr(d.value)}`
const voidText = computed(() => {
  const v = order.void
  if (!v) return ''
  return [
    v.reason,
    v.voided_by.name + (v.approved_by ? ` (${t('reports.approved_by', { name: v.approved_by.name })})` : ''),
    formatDateTime(v.voided_at, tz.value, locale.value),
    v.restock ? t('reports.restocked') : t('reports.not_restocked'),
  ].join(' · ')
})
</script>

<template>
  <PagePanel :title="`#${order.order_number}`">
    <template #actions>
      <UButton
        to="/orders"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        :label="t('nav.orders')"
      />
    </template>
    <div class="flex flex-col gap-4 max-w-2xl" data-testid="order">
      <div class="text-sm text-muted">
        {{ formatDateTime(order.paid_at, tz, locale) }} · {{ t(`orders.type_${order.order_type}`) }}
        <template v-if="order.customer_name"> · {{ order.customer_name }}</template>
        · {{ t('orders.by', { name: order.created_by.name }) }}
      </div>
      <UAlert
        v-if="order.void"
        color="error"
        variant="subtle"
        icon="i-lucide-ban"
        :title="t('orders.voided')"
        :description="voidText"
      />
      <div class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md">
        <div v-for="l in order.lines" :key="l.id" class="p-3">
          <div class="flex justify-between gap-2">
            <span class="font-medium">{{ l.qty }}× {{ l.item_name }}</span>
            <span class="tabular-nums">{{ formatIdr(l.line_net) }}</span>
          </div>
          <p v-if="l.modifiers.length" class="text-sm text-muted">
            {{
              l.modifiers
                .map((m) => (m.price_delta ? `${m.option_name} +${formatIdr(m.price_delta)}` : m.option_name))
                .join(' · ')
            }}
          </p>
          <p v-if="l.note" class="text-sm italic">“{{ l.note }}”</p>
          <p v-if="l.discount" class="text-sm text-muted">
            {{ discountLabel(l.discount) }} −{{ formatIdr(l.discount.amount) }}
          </p>
          <p v-if="l.cogs !== undefined" class="text-xs text-muted">
            {{ t('reports.cogs') }} {{ formatQty(l.cogs) }}
          </p>
        </div>
      </div>
      <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <dt>{{ t('reports.gross_sales') }}</dt>
        <dd class="tabular-nums text-right">{{ formatIdr(order.subtotal) }}</dd>
        <template v-if="order.item_discount_total">
          <dt>{{ t('orders.item_discounts') }}</dt>
          <dd class="tabular-nums text-right">−{{ formatIdr(order.item_discount_total) }}</dd>
        </template>
        <template v-if="order.order_discount">
          <dt>{{ discountLabel(order.order_discount) }}</dt>
          <dd class="tabular-nums text-right">−{{ formatIdr(order.order_discount.amount) }}</dd>
        </template>
        <template v-if="order.service_charge_amount">
          <dt>{{ t('reports.service_charge') }} {{ formatBps(order.service_charge_bps) }}</dt>
          <dd class="tabular-nums text-right">{{ formatIdr(order.service_charge_amount) }}</dd>
        </template>
        <template v-if="order.tax_amount">
          <dt>{{ order.tax_name }} {{ formatBps(order.tax_bps) }}</dt>
          <dd class="tabular-nums text-right">{{ formatIdr(order.tax_amount) }}</dd>
        </template>
        <dt class="font-semibold">{{ t('orders.total') }}</dt>
        <dd class="tabular-nums text-right font-semibold">{{ formatIdr(order.total) }}</dd>
        <template v-if="order.cogs_total !== undefined">
          <dt class="text-muted">{{ t('reports.cogs') }}</dt>
          <dd class="tabular-nums text-right text-muted">{{ formatIdr(order.cogs_total) }}</dd>
        </template>
      </dl>
      <div>
        <h2 class="font-semibold mb-1">{{ t('orders.payments') }}</h2>
        <div v-for="p in order.payments" :key="p.seq" class="flex justify-between gap-2 text-sm py-1">
          <span>
            {{ t(`payment_methods.${p.method}`) }}
            <span v-if="p.provider || p.reference" class="text-muted">
              · {{ [p.provider, p.reference].filter(Boolean).join(' ') }}
            </span>
            <span v-if="p.tendered !== null && p.tendered !== p.amount" class="text-muted">
              · {{ t('orders.tendered', { amount: formatIdr(p.tendered) }) }}
            </span>
          </span>
          <span class="tabular-nums">{{ formatIdr(p.amount) }}</span>
        </div>
        <p v-if="order.change_due" class="text-sm text-muted">
          {{ t('orders.change', { amount: formatIdr(order.change_due) }) }}
        </p>
      </div>
    </div>
  </PagePanel>
</template>
