<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { me, can, logout } = useAuth()

const items = computed<NavigationMenuItem[]>(() =>
  [
    { label: t('nav.home'), icon: 'i-lucide-house', to: '/', show: can('reports.view') },
    { label: t('nav.menu'), icon: 'i-lucide-coffee', to: '/menu', show: can('menu.manage') },
    {
      label: t('nav.modifiers'),
      icon: 'i-lucide-sliders-horizontal',
      to: '/menu/modifiers',
      show: can('menu.manage'),
    },
    { label: t('nav.ingredients'), icon: 'i-lucide-package', to: '/ingredients', show: can('menu.manage') },
    { label: t('nav.discounts'), icon: 'i-lucide-percent', to: '/discounts', show: can('menu.manage') },
    { label: t('nav.settings'), icon: 'i-lucide-settings', to: '/settings', show: can('settings.manage') },
  ]
    .filter((i) => i.show)
    .map(({ show: _show, ...item }) => item),
)
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible :ui="{ footer: 'border-t border-default' }">
      <template #header="{ collapsed }">
        <span v-if="!collapsed" class="font-semibold truncate">{{ me?.tenant.name ?? t('app.name') }}</span>
        <UIcon v-else name="i-lucide-coffee" class="size-5 mx-auto" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="items" orientation="vertical" />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex flex-col gap-2 w-full">
          <p v-if="!collapsed" class="text-sm text-muted truncate">
            {{ me?.user.name }} · {{ t(`roles.${me?.user.role ?? 'owner'}`) }}
          </p>
          <div class="flex items-center justify-between gap-2">
            <LocaleSwitch v-if="!collapsed" />
            <UButton
              icon="i-lucide-log-out"
              color="neutral"
              variant="ghost"
              :label="collapsed ? undefined : t('auth.logout')"
              @click="logout"
            />
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
