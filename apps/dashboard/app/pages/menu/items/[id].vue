<script setup lang="ts">
definePageMeta({ permission: 'menu.manage' })
const { t } = useI18n()
const api = useApi()
const run = useAction()
const notify = useNotify()
const route = useRoute()
const id = computed(() => String(route.params.id))

const item = ref<Item | null>(null)
const groups = ref<ModifierGroup[]>([])
const ingredients = ref<Ingredient[]>([])
const recipe = ref<Recipe | null>(null)
// Edited copies: the modifier-sheet order (D-033) and recipe lines for one unit.
const attached = ref<string[]>([])
const lines = ref<{ ingredient_id: string; qty: string | null }[]>([])

const load = async () => {
  const path = { id: id.value }
  const [i, g, ing, r] = await Promise.all([
    unwrap(api.GET('/v1/items/{id}', { params: { path } })),
    unwrap(api.GET('/v1/modifier-groups')),
    unwrap(api.GET('/v1/ingredients')),
    unwrap(api.GET('/v1/items/{id}/recipe', { params: { path } })),
  ])
  item.value = i
  groups.value = g.groups
  ingredients.value = ing.ingredients
  recipe.value = r
  attached.value = [...i.modifier_group_ids]
  lines.value = r.lines.map((l) => ({ ingredient_id: l.ingredient_id, qty: l.qty as string | null }))
}
await load()
useHead({ title: () => item.value?.name ?? t('nav.menu') })

// --- Modifier groups attached to the item.
const groupById = computed(() => new Map(groups.value.map((g) => [g.id, g])))
// The picker adds the chosen group, then is re-created so it shows its placeholder again.
const pickerKey = ref(0)
const addGroup = (gid: string) => {
  attached.value = [...attached.value, gid]
  pickerKey.value++
}
const unattached = computed(() => groups.value.filter((g) => !attached.value.includes(g.id)))
const move = (index: number, delta: number) => {
  const next = [...attached.value]
  const [moved] = next.splice(index, 1)
  if (moved) next.splice(index + delta, 0, moved)
  attached.value = next
}
const saveGroups = async () => {
  if (
    await run(() =>
      unwrap(
        api.PUT('/v1/items/{id}/modifier-groups', {
          params: { path: { id: id.value } },
          body: { group_ids: attached.value },
        }),
      ),
    )
  ) {
    await load()
  }
}

// --- Recipe lines.
const ingredientById = computed(() => {
  const map = new Map<string, { name: string; base_unit: string; archived: boolean }>()
  for (const l of recipe.value?.lines ?? []) {
    map.set(l.ingredient_id, {
      name: l.ingredient_name,
      base_unit: l.base_unit,
      archived: l.ingredient_archived,
    })
  }
  for (const i of ingredients.value) map.set(i.id, { name: i.name, base_unit: i.base_unit, archived: false })
  return map
})
const ingredientChoices = computed(() =>
  [...ingredientById.value].map(([value, i]) => ({
    label: i.archived ? `${i.name} (${t('common.archived')})` : i.name,
    value,
  })),
)
const linesValid = computed(
  () =>
    lines.value.every((l) => l.ingredient_id && l.qty !== null && l.qty !== '0') &&
    new Set(lines.value.map((l) => l.ingredient_id)).size === lines.value.length,
)
const saveRecipe = async () => {
  const body = { lines: lines.value.map((l) => ({ ingredient_id: l.ingredient_id, qty: l.qty ?? '' })) }
  if (
    await run(() => unwrap(api.PUT('/v1/items/{id}/recipe', { params: { path: { id: id.value } }, body })))
  ) {
    await load()
    await refreshPreview()
  }
}

// --- Preview: pick options, see exactly what one sale deducts (SPEC §7.1).
const picks = ref<Record<string, string[]>>({})
const previewQty = ref(1)
const preview = ref<Preview | null>(null)
const attachedGroups = computed(() =>
  (item.value?.modifier_group_ids ?? [])
    .map((g) => groupById.value.get(g))
    .filter((g): g is ModifierGroup => !!g),
)
const togglePick = (group: ModifierGroup, optionId: string, on: boolean) => {
  const current = picks.value[group.id] ?? []
  picks.value[group.id] =
    group.selection === 'single'
      ? on
        ? [optionId]
        : []
      : on
        ? [...current, optionId]
        : current.filter((o) => o !== optionId)
}
const refreshPreview = async () => {
  const option_ids = attachedGroups.value.flatMap((g) => picks.value[g.id] ?? [])
  try {
    preview.value = await unwrap(
      api.POST('/v1/recipes/preview', { body: { item_id: id.value, option_ids, qty: previewQty.value } }),
    )
  } catch (err) {
    notify.failed(err)
  }
}
watch([picks, previewQty], refreshPreview, { deep: true })
for (const g of attachedGroups.value)
  picks.value[g.id] = g.options.filter((o) => o.is_default).map((o) => o.id)
await refreshPreview()
</script>

<template>
  <PagePanel :title="item?.name ?? ''">
    <template #actions>
      <UButton
        :to="item ? { path: '/menu', query: { category: item.category_id } } : '/menu'"
        icon="i-lucide-arrow-left"
        data-testid="back-to-menu"
        variant="ghost"
        color="neutral"
        :label="t('nav.menu')"
      />
    </template>

    <div v-if="item" class="grid gap-6 xl:grid-cols-2">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">{{ t('item.recipe') }}</h2>
            <span class="text-sm text-muted">{{ t('item.recipe_per_unit') }}</span>
          </div>
        </template>
        <div class="flex flex-col gap-3" data-testid="recipe">
          <p v-if="lines.length === 0" class="text-muted text-sm">{{ t('item.no_recipe') }}</p>
          <div v-for="(line, index) in lines" :key="index" class="flex gap-2 items-start">
            <USelectMenu
              v-model="line.ingredient_id"
              :items="ingredientChoices"
              value-key="value"
              :placeholder="t('item.pick_ingredient')"
              class="flex-1"
            />
            <QtyInput
              v-model="line.qty"
              :unit="ingredientById.get(line.ingredient_id)?.base_unit"
              class="w-36"
            />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              :aria-label="t('common.remove')"
              @click="lines.splice(index, 1)"
            />
          </div>
          <div class="flex gap-2 justify-between">
            <UButton
              icon="i-lucide-plus"
              variant="soft"
              :label="t('item.add_ingredient')"
              @click="lines.push({ ingredient_id: '', qty: null })"
            />
            <UButton :label="t('item.save_recipe')" :disabled="!linesValid" @click="saveRecipe" />
          </div>
          <p v-if="ingredients.length === 0" class="text-sm text-muted">
            {{ t('item.no_ingredients_yet') }} <ULink to="/ingredients">{{ t('nav.ingredients') }}</ULink>
          </p>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">{{ t('item.modifier_groups') }}</h2>
        </template>
        <div class="flex flex-col gap-2" data-testid="item-groups">
          <p v-if="attached.length === 0" class="text-muted text-sm">{{ t('item.no_groups') }}</p>
          <div v-for="(gid, index) in attached" :key="gid" class="flex items-center gap-2">
            <span class="flex-1">
              {{ groupById.get(gid)?.name }}
              <UBadge
                v-if="groupById.get(gid)?.required"
                size="sm"
                variant="subtle"
                :label="t('modifiers.required')"
              />
            </span>
            <UButton
              icon="i-lucide-arrow-up"
              variant="ghost"
              color="neutral"
              :disabled="index === 0"
              :aria-label="t('common.move_up')"
              @click="move(index, -1)"
            />
            <UButton
              icon="i-lucide-arrow-down"
              variant="ghost"
              color="neutral"
              :disabled="index === attached.length - 1"
              :aria-label="t('common.move_down')"
              @click="move(index, 1)"
            />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              :aria-label="t('common.remove')"
              @click="attached.splice(index, 1)"
            />
          </div>
          <div class="flex gap-2 justify-between flex-wrap">
            <USelectMenu
              v-if="unattached.length"
              :key="pickerKey"
              :items="unattached.map((g) => ({ label: g.name, value: g.id }))"
              value-key="value"
              :placeholder="t('item.add_group')"
              class="w-60"
              @update:model-value="addGroup"
            />
            <UButton :label="t('common.save')" @click="saveGroups" />
          </div>
        </div>
      </UCard>

      <UCard class="xl:col-span-2">
        <template #header>
          <h2 class="font-semibold">{{ t('item.preview') }}</h2>
          <p class="text-sm text-muted">{{ t('item.preview_help') }}</p>
        </template>
        <div class="grid gap-6 md:grid-cols-2">
          <div class="flex flex-col gap-4">
            <div v-for="g in attachedGroups" :key="g.id">
              <p class="text-sm font-medium mb-1">{{ g.name }}</p>
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <UCheckbox
                  v-for="o in g.options"
                  :key="o.id"
                  :label="o.price_delta ? `${o.name} (+${formatIdr(o.price_delta)})` : o.name"
                  :model-value="(picks[g.id] ?? []).includes(o.id)"
                  @update:model-value="(v) => togglePick(g, o.id, v === true)"
                />
              </div>
            </div>
            <UFormField :label="t('item.preview_qty')">
              <UInputNumber v-model="previewQty" :min="1" :max="999" class="w-32" />
            </UFormField>
          </div>
          <div data-testid="preview">
            <p v-if="!preview || preview.ingredients.length === 0" class="text-muted text-sm">
              {{ t('item.preview_empty') }}
            </p>
            <table v-else class="w-full text-sm">
              <tbody>
                <tr
                  v-for="row in preview.ingredients"
                  :key="row.ingredient_id"
                  class="border-b border-default"
                >
                  <td class="py-1.5">{{ row.ingredient_name }}</td>
                  <td class="py-1.5 text-right tabular-nums">{{ formatQty(row.qty, row.base_unit) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </UCard>
    </div>
  </PagePanel>
</template>
