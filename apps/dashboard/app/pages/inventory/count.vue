<script setup lang="ts">
// Stock count: a list with number inputs, submit all; empty rows don't change (SPEC §11.1 #8).
definePageMeta({ permission: 'stock.adjust' })
const { t } = useI18n()
const api = useApi()
const run = useAction()
useHead({ title: () => t('inventory.count') })

const ingredients = (await unwrap(api.GET('/v1/ingredients'))).ingredients
const counted = reactive<Record<string, string | null>>(
  Object.fromEntries(ingredients.map((i) => [i.id, null])),
)
const note = ref('')
const saving = ref(false)
const filled = computed(() => Object.entries(counted).filter((e): e is [string, string] => e[1] !== null))
const save = async () => {
  if (filled.value.length === 0) return
  saving.value = true
  const ok = await run(() =>
    unwrap(
      api.POST('/v1/stock/count', {
        body: {
          counts: filled.value.map(([ingredient_id, counted_qty]) => ({ ingredient_id, counted_qty })),
          ...(note.value.trim() ? { note: note.value.trim() } : {}),
        },
      }),
    ),
  )
  saving.value = false
  if (ok) await navigateTo('/inventory')
}
</script>

<template>
  <PagePanel :title="t('inventory.count')">
    <template #actions>
      <UButton
        to="/inventory"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        :label="t('nav.inventory')"
      />
    </template>
    <div class="flex flex-col gap-3 max-w-2xl">
      <p class="text-sm text-muted">{{ t('inventory.count_help') }}</p>
      <div
        class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md"
        data-testid="count"
      >
        <div v-for="i in ingredients" :key="i.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
          <div class="flex-1 min-w-36">
            <p class="font-medium">{{ i.name }}</p>
            <p class="text-xs text-muted">
              {{ t('inventory.system') }}: {{ formatQty(i.stock_qty, i.base_unit) }}
            </p>
          </div>
          <div class="w-40">
            <QtyInput
              :model-value="counted[i.id] ?? null"
              :unit="i.base_unit"
              @update:model-value="(v: string | null) => (counted[i.id] = v)"
            />
          </div>
        </div>
      </div>
      <UFormField :label="t('inventory.note')" name="note">
        <UInput v-model="note" :maxlength="150" class="w-full" />
      </UFormField>
      <UButton
        :label="t('inventory.save_count', { n: filled.length })"
        :loading="saving"
        :disabled="filled.length === 0"
        class="self-start"
        @click="save"
      />
    </div>
  </PagePanel>
</template>
