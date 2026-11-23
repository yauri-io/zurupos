<script setup lang="ts">
// New-shop setup checklist on Home (D-056): ticked from real data, hidden once
// the required steps are done. "Hide" is a per-browser convenience only.
const props = defineProps<{ ingredients: number; today: string }>()
const { t } = useI18n()
const { me } = useAuth()
const api = useApi()

const dismissKey = computed(() => `zuru.setup.hidden.${me.value?.tenant.id ?? ''}`)
const readHidden = () => {
  try {
    return localStorage.getItem(dismissKey.value) === '1'
  } catch {
    return false
  }
}
const hidden = ref(readHidden())
const hide = () => {
  hidden.value = true
  try {
    localStorage.setItem(dismissKey.value, '1')
  } catch {
    // Storage blocked (private window): hidden for this visit only.
  }
}

const { data: steps } = await useAsyncData('setup-steps', async () => {
  if (hidden.value) return null
  const [settings, items, users, devices, orders] = await Promise.all([
    unwrap(api.GET('/v1/settings')),
    unwrap(api.GET('/v1/items')),
    unwrap(api.GET('/v1/users')),
    unwrap(api.GET('/v1/devices')),
    // Any order in the last year counts; the API allows at most 366 days.
    unwrap(
      api.GET('/v1/orders', {
        params: { query: { from: addDays(props.today, -365), to: props.today, limit: '1' } },
      }),
    ),
  ])
  return setupSteps({
    hasContact: Boolean(settings.address || settings.phone),
    items: items.items.length,
    ingredients: props.ingredients,
    users: users.users.length,
    activeDevices: devices.devices.filter((d) => !d.revoked_at).length,
    hasOrder: orders.orders.length > 0,
  })
})

const show = computed(() => !hidden.value && steps.value && !setupComplete(steps.value))
const doneCount = computed(() => steps.value?.filter((s) => s.done).length ?? 0)
const ICONS: Record<SetupStepKey, string> = {
  profile: 'i-lucide-store',
  menu: 'i-lucide-coffee',
  ingredients: 'i-lucide-package',
  staff: 'i-lucide-users',
  device: 'i-lucide-tablet-smartphone',
  first_order: 'i-lucide-receipt',
}
</script>

<template>
  <UCard v-if="show && steps" data-testid="setup-checklist">
    <template #header>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="font-semibold">{{ t('setup.title') }}</h2>
          <p class="text-sm text-muted">
            {{ t('setup.progress', { done: doneCount, total: steps.length }) }}
          </p>
        </div>
        <UButton
          :label="t('setup.hide')"
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide-eye-off"
          @click="hide"
        />
      </div>
      <UProgress :model-value="doneCount" :max="steps.length" size="sm" class="mt-3" />
    </template>
    <ol class="flex flex-col divide-y divide-(--ui-border)">
      <li
        v-for="s in steps"
        :key="s.key"
        class="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0"
      >
        <UIcon
          :name="s.done ? 'i-lucide-circle-check' : ICONS[s.key]"
          class="size-5 shrink-0 mt-0.5"
          :class="s.done ? 'text-success' : 'text-muted'"
        />
        <div class="min-w-0">
          <p class="font-medium" :class="{ 'line-through text-muted': s.done }">
            {{ t(`setup.${s.key}.title`) }}
            <UBadge
              v-if="s.optional"
              :label="t('setup.optional')"
              color="neutral"
              variant="subtle"
              size="sm"
              class="ms-1"
            />
          </p>
          <p v-if="!s.done" class="text-sm text-muted">{{ t(`setup.${s.key}.body`) }}</p>
          <ULink
            v-if="!s.done && s.key === 'device'"
            :to="CASHIER_APK_URL"
            external
            class="text-sm text-primary inline-flex items-center gap-1 mt-1"
          >
            <UIcon name="i-lucide-download" class="size-4" />{{ t('setup.download_apk') }}
          </ULink>
        </div>
        <UButton
          v-if="!s.done && s.key !== 'first_order'"
          :to="s.to"
          :label="t(`setup.${s.key}.action`)"
          size="sm"
          variant="soft"
          trailing-icon="i-lucide-arrow-right"
          class="col-start-2 sm:col-start-auto justify-self-start"
        />
      </li>
    </ol>
  </UCard>
</template>
