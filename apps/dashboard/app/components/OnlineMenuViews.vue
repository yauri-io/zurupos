<script setup lang="ts">
// "Dilihat" (PRD F19, SPEC §12.7, D-083): how often the online menu was opened.
// Approximate on purpose: no cookies, bots left out, one count per phone per 30 min.
const { t } = useI18n()
const api = useApi()
const views = await unwrap(api.GET('/v1/online-menu/views', { params: { query: { days: '30' } } }))

const qr = computed(() => views.days.reduce((n, d) => n + d.qr, 0))
const link = computed(() => views.days.reduce((n, d) => n + d.link, 0))
const change = computed(() =>
  views.previous_7 === 0 ? null : Math.round(((views.last_7 - views.previous_7) / views.previous_7) * 100),
)
const points = computed(() =>
  views.days.map((d) => ({ label: String(Number(d.business_date.slice(8, 10))), value: d.qr + d.link })),
)
const count = (v: number) => t('online_menu.views.times', { n: v })
</script>

<template>
  <UCard data-testid="views-card">
    <template #header>
      <h2 class="font-semibold">
        {{ t('online_menu.views.title') }} <HelpTip :text="t('online_menu.views.help')" />
      </h2>
    </template>
    <div class="flex flex-col gap-5">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-sm text-muted">{{ t('online_menu.views.today') }}</p>
          <p class="text-2xl font-semibold tabular-nums" data-testid="views-today">
            {{ count(views.today) }}
          </p>
        </div>
        <div>
          <p class="text-sm text-muted">{{ t('online_menu.views.last_7') }}</p>
          <p class="text-2xl font-semibold tabular-nums" data-testid="views-last7">
            {{ count(views.last_7) }}
          </p>
          <p class="text-xs text-muted" data-testid="views-previous7">
            {{ t('online_menu.views.previous_7', { n: views.previous_7 }) }}
            <span v-if="change !== null" :class="change >= 0 ? 'text-success' : 'text-error'">
              ({{ change >= 0 ? '+' : '' }}{{ change }}%)
            </span>
          </p>
        </div>
      </div>
      <div>
        <p class="text-sm text-muted mb-2">{{ t('online_menu.views.last_30') }}</p>
        <BarChart :points="points" :format="count" />
      </div>
      <p class="text-sm" data-testid="views-split">
        {{ t('online_menu.views.split', { qr, link }) }}
      </p>
    </div>
  </UCard>
</template>
