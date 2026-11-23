<script setup lang="ts">
// Paired cashier devices (owner): last seen, app version, revoke (ends its staff sessions).
definePageMeta({ permission: 'devices.manage' })
const { t, locale } = useI18n()
const api = useApi()
const run = useAction()
const { me } = useAuth()
useHead({ title: () => t('nav.devices') })

const devices = ref<Device[]>([])
const load = async () => {
  devices.value = (await unwrap(api.GET('/v1/devices'))).devices
}
await load()
const tz = computed(() => me.value?.tenant.timezone ?? 'Asia/Jakarta')
const revoke = async (d: Device) => {
  if (!confirm(t('devices.confirm_revoke', { name: d.name }))) return
  if (await run(() => unwrap(api.POST('/v1/devices/{id}/revoke', { params: { path: { id: d.id } } }))))
    await load()
}
</script>

<template>
  <PagePanel :title="t('nav.devices')">
    <template #actions>
      <UButton
        :to="CASHIER_APK_URL"
        external
        icon="i-lucide-download"
        variant="soft"
        :label="t('devices.download')"
      />
    </template>
    <p class="text-sm text-muted mb-3">{{ t('devices.help') }}</p>
    <EmptyState
      v-if="devices.length === 0"
      icon="i-lucide-tablet-smartphone"
      :title="t('devices.empty_title')"
    >
      <ol class="list-decimal ps-5 text-sm text-muted text-start max-w-md flex flex-col gap-1">
        <li>{{ t('devices.step_download') }}</li>
        <li>{{ t('devices.step_login') }}</li>
        <li>{{ t('devices.step_done') }}</li>
      </ol>
      <UButton :to="CASHIER_APK_URL" external icon="i-lucide-download" :label="t('devices.download')" />
    </EmptyState>
    <div
      v-else
      class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md"
      data-testid="devices"
    >
      <div
        v-for="d in devices"
        :key="d.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3"
        :class="{ 'opacity-50': d.revoked_at }"
      >
        <div class="flex-1 min-w-48">
          <p class="font-medium">
            {{ d.name }}
            <UBadge
              v-if="d.revoked_at"
              :label="t('devices.revoked')"
              color="error"
              variant="subtle"
              size="sm"
              class="ms-1"
            />
          </p>
          <p class="text-xs text-muted">
            {{
              t('devices.paired_by', { name: d.paired_by.name, at: formatDateTime(d.created_at, tz, locale) })
            }}
            ·
            {{
              d.last_seen_at
                ? t('devices.last_seen', { at: formatDateTime(d.last_seen_at, tz, locale) })
                : t('users.never')
            }}
            <template v-if="d.app_version"> · v{{ d.app_version }}</template>
          </p>
        </div>
        <UButton
          v-if="!d.revoked_at"
          color="error"
          variant="soft"
          icon="i-lucide-unplug"
          :label="t('devices.revoke')"
          @click="revoke(d)"
        />
      </div>
    </div>
  </PagePanel>
</template>
