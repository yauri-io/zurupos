<script setup lang="ts">
definePageMeta({ permission: 'settings.manage' })
const { t } = useI18n()
const api = useApi()
const run = useAction()
useHead({ title: () => t('nav.settings') })

const METHODS = ['cash', 'qris', 'debit', 'credit', 'transfer', 'other'] as const
const settings = await unwrap(api.GET('/v1/settings'))
const form = reactive({
  name: settings.name,
  address: settings.address ?? '',
  phone: settings.phone ?? '',
  timezone: settings.timezone,
  business_day_cutoff_hour: settings.business_day_cutoff_hour,
  receipt_header: settings.receipt_header ?? '',
  receipt_footer: settings.receipt_footer ?? '',
  service_charge_enabled: settings.service_charge_enabled,
  service_charge: formatBps(settings.service_charge_bps).replace('%', ''),
  tax_enabled: settings.tax_enabled,
  tax_name: settings.tax_name,
  tax: formatBps(settings.tax_bps).replace('%', ''),
  tax_on_service_charge: settings.tax_on_service_charge,
  enabled_payment_methods: [...settings.enabled_payment_methods] as string[],
  low_stock_alerts_enabled: settings.alerts?.low_stock_alerts_enabled ?? true,
  alert_extra_emails: (settings.alerts?.alert_extra_emails ?? []).join(', '),
  idle_lock_minutes: settings.idle_lock_minutes,
})

const serviceBps = computed(() => parsePercentToBps(form.service_charge))
const taxBps = computed(() => parsePercentToBps(form.tax))
// Live example (SPEC §12.3) for a Rp 100.000 order, same formula as the server.
const EXAMPLE_NET = 100000
const example = computed(() =>
  exampleTotals(EXAMPLE_NET, {
    service_charge_enabled: form.service_charge_enabled,
    service_charge_bps: serviceBps.value ?? 0,
    tax_enabled: form.tax_enabled,
    tax_bps: taxBps.value ?? 0,
    tax_on_service_charge: form.tax_on_service_charge,
  }),
)
const emails = computed(() =>
  form.alert_extra_emails
    .split(/[,\s]+/)
    .map((e) => e.trim())
    .filter(Boolean),
)
const valid = computed(
  () =>
    form.name.trim() !== '' &&
    form.tax_name.trim() !== '' &&
    serviceBps.value !== null &&
    taxBps.value !== null &&
    form.enabled_payment_methods.length > 0,
)
const timezones = ['Asia/Jakarta', 'Asia/Pontianak', 'Asia/Makassar', 'Asia/Jayapura']

const toggleMethod = (m: string, on: boolean) => {
  form.enabled_payment_methods = on
    ? METHODS.filter((x) => x === m || form.enabled_payment_methods.includes(x))
    : form.enabled_payment_methods.filter((x) => x !== m)
}

const save = async () => {
  if (!valid.value || serviceBps.value === null || taxBps.value === null) return
  const orNull = (s: string) => (s.trim() === '' ? null : s.trim())
  await run(() =>
    unwrap(
      api.PATCH('/v1/settings', {
        body: {
          name: form.name,
          address: orNull(form.address),
          phone: orNull(form.phone),
          timezone: form.timezone,
          business_day_cutoff_hour: form.business_day_cutoff_hour,
          receipt_header: orNull(form.receipt_header),
          receipt_footer: orNull(form.receipt_footer),
          service_charge_enabled: form.service_charge_enabled,
          service_charge_bps: serviceBps.value ?? 0,
          tax_enabled: form.tax_enabled,
          tax_name: form.tax_name,
          tax_bps: taxBps.value ?? 0,
          tax_on_service_charge: form.tax_on_service_charge,
          enabled_payment_methods: form.enabled_payment_methods as (typeof METHODS)[number][],
          low_stock_alerts_enabled: form.low_stock_alerts_enabled,
          alert_extra_emails: emails.value,
          idle_lock_minutes: form.idle_lock_minutes,
        },
      }),
    ),
  )
}
</script>

<template>
  <PagePanel :title="t('nav.settings')">
    <UForm :state="form" class="flex flex-col gap-6 max-w-2xl" @submit="save">
      <UCard>
        <template #header
          ><h2 class="font-semibold">{{ t('settings.profile') }}</h2></template
        >
        <div class="flex flex-col gap-4">
          <UFormField :label="t('settings.shop_name')" name="name" required>
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField :label="t('settings.address')" name="address">
            <UTextarea v-model="form.address" :rows="2" class="w-full" />
          </UFormField>
          <UFormField :label="t('settings.phone')" name="phone">
            <UInput v-model="form.phone" class="w-full" />
          </UFormField>
          <div class="grid sm:grid-cols-2 gap-4">
            <UFormField :label="t('settings.timezone')" name="timezone">
              <USelect v-model="form.timezone" :items="timezones" class="w-full" />
            </UFormField>
            <UFormField
              :label="t('settings.cutoff')"
              :help="t('settings.cutoff_help')"
              name="business_day_cutoff_hour"
            >
              <template #hint><HelpTip :text="t('help.cutoff')" /></template>
              <UInputNumber v-model="form.business_day_cutoff_hour" :min="0" :max="6" class="w-full" />
            </UFormField>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header
          ><h2 class="font-semibold">{{ t('settings.tax_service') }}</h2></template
        >
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-1">
            <USwitch v-model="form.tax_enabled" :label="t('settings.tax_enabled')" />
            <HelpTip :text="t('help.tax')" />
          </div>
          <div v-if="form.tax_enabled" class="grid sm:grid-cols-2 gap-4">
            <UFormField :label="t('settings.tax_name')" name="tax_name">
              <UInput v-model="form.tax_name" class="w-full" />
            </UFormField>
            <UFormField
              :label="t('settings.rate')"
              name="tax"
              :error="taxBps === null ? t('settings.rate_invalid') : undefined"
            >
              <UInput v-model="form.tax" inputmode="decimal" class="w-full">
                <template #trailing><span class="text-muted">%</span></template>
              </UInput>
            </UFormField>
          </div>
          <div class="flex items-center gap-1">
            <USwitch v-model="form.service_charge_enabled" :label="t('settings.service_enabled')" />
            <HelpTip :text="t('help.service')" />
          </div>
          <UFormField
            v-if="form.service_charge_enabled"
            :label="t('settings.rate')"
            name="service_charge"
            :error="serviceBps === null ? t('settings.rate_invalid') : undefined"
          >
            <UInput v-model="form.service_charge" inputmode="decimal" class="w-40">
              <template #trailing><span class="text-muted">%</span></template>
            </UInput>
          </UFormField>
          <div v-if="form.tax_enabled && form.service_charge_enabled" class="flex items-center gap-1">
            <USwitch v-model="form.tax_on_service_charge" :label="t('settings.tax_on_service')" />
            <HelpTip :text="t('help.tax_on_service')" />
          </div>
          <p class="text-xs text-muted">{{ t('settings.prices_exclude_tax') }}</p>
          <dl
            class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm rounded-md bg-elevated p-3 max-w-sm"
            data-testid="tax-example"
          >
            <dt class="col-span-2 font-medium">
              {{ t('settings.example', { net: formatIdr(example.net) }) }}
            </dt>
            <template v-if="form.service_charge_enabled">
              <dt>{{ t('reports.service_charge') }} {{ formatBps(serviceBps ?? 0) }}</dt>
              <dd class="tabular-nums text-right">{{ formatIdr(example.service) }}</dd>
            </template>
            <template v-if="form.tax_enabled">
              <dt>{{ form.tax_name }} {{ formatBps(taxBps ?? 0) }}</dt>
              <dd class="tabular-nums text-right">{{ formatIdr(example.tax) }}</dd>
            </template>
            <dt class="font-semibold">{{ t('settings.example_total') }}</dt>
            <dd class="tabular-nums text-right font-semibold">{{ formatIdr(example.total) }}</dd>
          </dl>
        </div>
      </UCard>

      <UCard>
        <template #header
          ><h2 class="font-semibold">{{ t('settings.payments') }}</h2></template
        >
        <div class="flex flex-wrap gap-4">
          <UCheckbox
            v-for="m in METHODS"
            :key="m"
            :label="t(`payment_methods.${m}`)"
            :model-value="form.enabled_payment_methods.includes(m)"
            @update:model-value="(v) => toggleMethod(m, v === true)"
          />
        </div>
      </UCard>

      <UCard>
        <template #header
          ><h2 class="font-semibold">{{ t('settings.receipt') }}</h2></template
        >
        <div class="flex flex-col gap-4">
          <UFormField :label="t('settings.receipt_header')" name="receipt_header">
            <UTextarea v-model="form.receipt_header" :rows="2" class="w-full" />
          </UFormField>
          <UFormField :label="t('settings.receipt_footer')" name="receipt_footer">
            <UTextarea v-model="form.receipt_footer" :rows="2" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header
          ><h2 class="font-semibold">{{ t('settings.alerts_device') }}</h2></template
        >
        <div class="flex flex-col gap-4">
          <USwitch v-model="form.low_stock_alerts_enabled" :label="t('settings.low_stock_alerts')" />
          <UFormField
            :label="t('settings.extra_emails')"
            :help="t('settings.extra_emails_help')"
            name="alert_extra_emails"
          >
            <UInput v-model="form.alert_extra_emails" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('settings.idle_lock')"
            :help="t('settings.idle_lock_help')"
            name="idle_lock_minutes"
          >
            <UInputNumber v-model="form.idle_lock_minutes" :min="0" :max="240" class="w-40" />
          </UFormField>
        </div>
      </UCard>

      <UButton type="submit" size="lg" class="self-start" :disabled="!valid" :label="t('common.save')" />
    </UForm>
  </PagePanel>
</template>
