<script setup lang="ts">
// Edits what one modifier option does to the recipe (SPEC §4.1 effects).
const props = defineProps<{ option: ModifierOption; ingredients: Ingredient[] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const api = useApi()
const run = useAction()

type Row = {
  effect: 'add' | 'remove' | 'replace'
  ingredient_id: string
  target_ingredient_id: string
  qty: string | null
}
const rows = ref<Row[]>([])
const known = ref(new Map<string, { name: string; base_unit: string }>())

watch(
  open,
  async (isOpen) => {
    if (!isOpen) return
    const data = await unwrap(
      api.GET('/v1/modifier-options/{id}/effects', { params: { path: { id: props.option.id } } }),
    )
    const map = new Map(
      props.ingredients.map((i) => [i.id, { name: i.name, base_unit: i.base_unit as string }]),
    )
    for (const e of data.effects) {
      map.set(e.ingredient_id, { name: e.ingredient_name, base_unit: e.base_unit })
      if (e.target_ingredient_id)
        map.set(e.target_ingredient_id, { name: e.target_ingredient_name ?? '', base_unit: e.base_unit })
    }
    known.value = map
    rows.value = data.effects.map((e) => ({
      effect: e.effect,
      ingredient_id: e.ingredient_id,
      target_ingredient_id: e.target_ingredient_id ?? '',
      qty: e.qty,
    }))
  },
  { immediate: true },
)

const choices = computed(() => [...known.value].map(([value, i]) => ({ label: i.name, value })))
const effectChoices = computed(() =>
  (['add', 'remove', 'replace'] as const).map((value) => ({ label: t(`effects.${value}`), value })),
)
const unitOf = (id: string) => known.value.get(id)?.base_unit

const valid = computed(() =>
  rows.value.every((r) => {
    if (!r.ingredient_id) return false
    if (r.effect === 'add') return r.qty !== null && r.qty !== '0'
    if (r.effect === 'replace')
      return !!r.target_ingredient_id && (r.target_ingredient_id !== r.ingredient_id || r.qty !== null)
    return true
  }),
)

const save = async () => {
  const effects = rows.value.map((r) => ({
    effect: r.effect,
    ingredient_id: r.ingredient_id,
    ...(r.effect === 'replace' ? { target_ingredient_id: r.target_ingredient_id, qty: r.qty } : {}),
    ...(r.effect === 'add' ? { qty: r.qty } : {}),
  }))
  const ok = await run(() =>
    unwrap(
      api.PUT('/v1/modifier-options/{id}/effects', {
        params: { path: { id: props.option.id } },
        body: { effects },
      }),
    ),
  )
  if (ok) open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('effects.title', { name: option.name })"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div class="flex flex-col gap-3" data-testid="effects">
        <p class="text-sm text-muted">{{ t('effects.help') }}</p>
        <p v-if="rows.length === 0" class="text-sm text-muted">{{ t('effects.none') }}</p>
        <div
          v-for="(row, index) in rows"
          :key="index"
          class="flex flex-wrap gap-2 items-start border-b border-default pb-3"
        >
          <USelect v-model="row.effect" :items="effectChoices" class="w-32" />
          <template v-if="row.effect === 'replace'">
            <USelectMenu
              v-model="row.target_ingredient_id"
              :items="choices"
              value-key="value"
              :placeholder="t('effects.replace_from')"
              class="w-44"
            />
            <UIcon name="i-lucide-arrow-right" class="mt-2" />
          </template>
          <USelectMenu
            v-model="row.ingredient_id"
            :items="choices"
            value-key="value"
            :placeholder="row.effect === 'replace' ? t('effects.replace_to') : t('item.pick_ingredient')"
            class="w-44"
          />
          <QtyInput
            v-if="row.effect !== 'remove'"
            v-model="row.qty"
            :unit="unitOf(row.ingredient_id)"
            :placeholder="row.effect === 'replace' ? t('effects.same_qty') : ''"
            class="w-32"
          />
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            :aria-label="t('common.remove')"
            @click="rows.splice(index, 1)"
          />
        </div>
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          class="self-start"
          :label="t('effects.add_row')"
          @click="rows.push({ effect: 'add', ingredient_id: '', target_ingredient_id: '', qty: null })"
        />
      </div>
    </template>
    <template #footer>
      <UButton :label="t('common.save')" :disabled="!valid" @click="save" />
    </template>
  </UModal>
</template>
