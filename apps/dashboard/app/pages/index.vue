<script setup lang="ts">
// Owner home with today's numbers arrives in M6 (SPEC §12.3). Managers land on /menu.
const { t } = useI18n()
const { can, me } = useAuth()
if (!can('reports.view')) await navigateTo('/menu', { replace: true })
useHead({ title: () => t('nav.home') })
</script>

<template>
  <PagePanel :title="t('nav.home')">
    <div class="flex flex-col gap-4 max-w-xl">
      <p class="text-lg">{{ t('home.welcome', { name: me?.user.name ?? '' }) }}</p>
      <p class="text-muted">{{ t('home.reports_soon') }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton to="/menu" icon="i-lucide-coffee" :label="t('nav.menu')" variant="soft" />
        <UButton to="/ingredients" icon="i-lucide-package" :label="t('nav.ingredients')" variant="soft" />
        <UButton to="/settings" icon="i-lucide-settings" :label="t('nav.settings')" variant="soft" />
      </div>
    </div>
  </PagePanel>
</template>
