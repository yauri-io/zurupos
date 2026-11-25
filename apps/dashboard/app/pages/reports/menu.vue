<script setup lang="ts">
import { MATRIX_PRESETS, rangeDays } from '../../utils/dates'

// Menu matrix (SPEC §12.5, PRD F16): which items to keep, re-price, promote or
// review, within one category. The API decides every group; this page lists them.
definePageMeta({ permission: 'costs.view' })
const { t } = useI18n()
const api = useApi()
const route = useRoute()
const router = useRouter()
const { range, setRange, today } = useRange('last30')
useHead({ title: () => t('matrix.title') })

const MAX_DAYS = 92
const tooLong = computed(() => rangeDays(range.value) > MAX_DAYS)
// The category lives in the URL too; without it the API picks the best-selling one.
const categoryId = computed(() =>
  typeof route.query.category === 'string' ? route.query.category : undefined,
)
const setCategory = (id: string) => router.replace({ query: { ...route.query, category: id } })

const { data, pending, error } = await useAsyncData(
  'report-menu-matrix',
  () =>
    tooLong.value
      ? Promise.resolve(null)
      : unwrap(
          api.GET('/v1/reports/menu-matrix', {
            params: {
              query: { ...range.value, ...(categoryId.value ? { category_id: categoryId.value } : {}) },
            },
          }),
        ),
  { watch: [range, categoryId] },
)

const QUADRANTS = ['andalan', 'naikkan_harga', 'promosikan', 'evaluasi'] as const
const groups = computed(() =>
  QUADRANTS.map((q) => ({ quadrant: q, items: (data.value?.items ?? []).filter((i) => i.quadrant === q) })),
)
const categoryItems = computed(() =>
  (data.value?.categories ?? []).map((c) => ({ label: c.name, value: c.id })),
)
const reasonText = (reason: string, ingredients: string[]) =>
  t(`matrix.reason_${reason}`, { names: ingredients.join(', ') })
</script>

<template>
  <ReportShell
    :title="t('matrix.title')"
    :range="range"
    :today="today"
    :pending="pending"
    :error="error"
    :presets="MATRIX_PRESETS"
    @range="setRange"
  >
    <p v-if="tooLong" class="text-error">{{ t('heatmap.too_long', { n: MAX_DAYS }) }}</p>
    <div v-else-if="data" class="flex flex-col gap-6 max-w-3xl">
      <p v-if="data.state === 'no_sales'" class="text-muted">{{ t('reports.empty') }}</p>
      <template v-else>
        <div class="flex flex-col gap-2">
          <UFormField :label="t('matrix.category')" class="max-w-xs">
            <USelect
              :model-value="data.category_id ?? undefined"
              :items="categoryItems"
              class="w-full"
              data-testid="matrix-category"
              @update:model-value="(v: string) => setCategory(v)"
            />
          </UFormField>
          <p v-if="data.coverage_bps !== null" class="text-sm" data-testid="matrix-coverage">
            {{
              t('matrix.coverage', {
                done: data.items.length,
                all: data.items.length + data.incomplete.length,
                pct: formatBps(data.coverage_bps),
              })
            }}
          </p>
        </div>

        <UAlert
          v-if="data.state === 'incomplete_costs'"
          color="neutral"
          variant="soft"
          icon="i-lucide-info"
          :title="t('matrix.state_incomplete_costs')"
          :description="t('matrix.state_incomplete_costs_hint')"
          data-testid="matrix-state"
        />
        <UAlert
          v-else-if="data.state === 'too_few_items'"
          color="neutral"
          variant="soft"
          icon="i-lucide-info"
          :title="t('matrix.state_too_few_items')"
          data-testid="matrix-state"
        />

        <template v-if="data.state === 'ok'">
          <p v-if="data.avg_margin_per_portion !== null" class="text-sm text-muted">
            {{ t('matrix.average', { amount: formatIdr(data.avg_margin_per_portion) }) }}
          </p>
          <div class="grid gap-4 md:grid-cols-2" data-testid="matrix-groups">
            <section
              v-for="g in groups"
              :key="g.quadrant"
              class="rounded-md border border-default p-3 flex flex-col gap-2 min-w-0"
              :data-testid="`matrix-${g.quadrant}`"
            >
              <h2 class="font-semibold">{{ t(`matrix.q_${g.quadrant}`) }}</h2>
              <p class="text-xs text-muted">{{ t(`matrix.q_${g.quadrant}_hint`) }}</p>
              <p v-if="g.items.length === 0" class="text-sm text-dimmed">{{ t('matrix.none') }}</p>
              <ul v-else class="flex flex-col divide-y divide-(--ui-border)">
                <li v-for="i in g.items" :key="i.item_id" class="py-2 flex flex-col gap-0.5 min-w-0">
                  <span class="font-medium flex flex-wrap items-center gap-2">
                    {{ i.name }}
                    <UBadge
                      v-if="i.archived"
                      variant="subtle"
                      color="neutral"
                      size="sm"
                      :label="t('matrix.archived')"
                    />
                  </span>
                  <span class="text-sm text-muted tabular-nums">
                    {{ t('matrix.line', { qty: i.qty, amount: formatIdr(i.margin_per_portion) }) }}
                  </span>
                  <!-- Amounts never break between "Rp" and the number. -->
                  <i18n-t
                    v-if="i.suggested_increase !== null && i.extra_30d !== null"
                    keypath="matrix.suggest"
                    tag="span"
                    class="text-sm"
                    data-testid="matrix-suggest"
                  >
                    <template #increase>
                      <span class="whitespace-nowrap">{{ formatIdr(i.suggested_increase) }}</span>
                    </template>
                    <template #extra>
                      <span class="whitespace-nowrap">{{ formatIdr(i.extra_30d) }}</span>
                    </template>
                  </i18n-t>
                </li>
              </ul>
            </section>
          </div>
        </template>

        <section
          v-if="data.incomplete.length > 0"
          class="flex flex-col gap-2"
          data-testid="matrix-incomplete"
        >
          <h2 class="font-semibold">{{ t('matrix.incomplete_title') }}</h2>
          <p class="text-sm text-muted">{{ t('matrix.incomplete_hint') }}</p>
          <ul class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md">
            <li
              v-for="i in data.incomplete"
              :key="i.item_id"
              class="p-3 flex flex-wrap items-start justify-between gap-2"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <span class="font-medium">{{ i.name }}</span>
                <span v-for="r in i.reasons" :key="r" class="text-sm text-muted">{{
                  reasonText(r, i.ingredients)
                }}</span>
              </div>
              <UButton
                v-if="!i.archived"
                size="sm"
                variant="outline"
                color="neutral"
                :to="`/menu/items/${i.item_id}`"
                :label="t('matrix.fix')"
              />
            </li>
          </ul>
        </section>
        <p class="text-xs text-muted">{{ t('matrix.note') }}</p>
      </template>
    </div>
  </ReportShell>
</template>
