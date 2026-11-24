<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { me, can, logout } = useAuth()

const items = computed<NavigationMenuItem[]>(() =>
  [
    { label: t('nav.home'), icon: 'i-lucide-house', to: '/', show: can('reports.view') },
    {
      label: t('nav.reports'),
      icon: 'i-lucide-chart-column',
      show: can('reports.view'),
      defaultOpen: true,
      children: [
        { label: t('nav.sales'), to: '/reports/sales' },
        { label: t('nav.payments'), to: '/reports/payments' },
        { label: t('nav.items'), to: '/reports/items' },
        ...(can('costs.view') ? [{ label: t('nav.margin'), to: '/reports/margin' }] : []),
        { label: t('nav.voids'), to: '/reports/voids' },
      ],
    },
    { label: t('nav.orders'), icon: 'i-lucide-receipt', to: '/orders', show: can('orders.view_all') },
    { label: t('nav.inventory'), icon: 'i-lucide-warehouse', to: '/inventory', show: can('stock.adjust') },
    { label: t('nav.menu'), icon: 'i-lucide-coffee', to: '/menu', show: can('menu.manage') },
    {
      label: t('nav.modifiers'),
      icon: 'i-lucide-sliders-horizontal',
      to: '/menu/modifiers',
      show: can('menu.manage'),
    },
    { label: t('nav.ingredients'), icon: 'i-lucide-package', to: '/ingredients', show: can('menu.manage') },
    { label: t('nav.discounts'), icon: 'i-lucide-percent', to: '/discounts', show: can('menu.manage') },
    { label: t('nav.users'), icon: 'i-lucide-users', to: '/users', show: can('users.manage') },
    {
      label: t('nav.devices'),
      icon: 'i-lucide-tablet-smartphone',
      to: '/devices',
      show: can('devices.manage'),
    },
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
        <div class="flex items-center gap-2 min-w-0" :class="{ 'mx-auto': collapsed }">
          <img src="/logo-mark.png" alt="" class="size-6 shrink-0" />
          <span v-if="!collapsed" class="font-semibold truncate">{{ me?.tenant.name ?? t('app.name') }}</span>
        </div>
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
          <AppVersion v-if="!collapsed" />
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
