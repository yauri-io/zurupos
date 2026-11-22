<script setup lang="ts">
definePageMeta({ permission: 'menu.manage' })
const { t } = useI18n()
const api = useApi()
const run = useAction()
useHead({ title: () => t('nav.menu') })

const route = useRoute()
const router = useRouter()

const categories = ref<Category[]>([])
const items = ref<Item[]>([])
// The open category is kept in the URL (?category=) and remembered for the
// session, so coming back from an item's page, the sidebar or a reload opens
// the same category again.
const lastCategory = useState<string | null>('menu-category', () => null)
const fromQuery = typeof route.query.category === 'string' ? route.query.category : null
const selected = ref<string | null>(fromQuery ?? lastCategory.value)

const load = async () => {
  const [c, i] = await Promise.all([unwrap(api.GET('/v1/categories')), unwrap(api.GET('/v1/items'))])
  categories.value = c.categories
  items.value = i.items
  if (!selected.value || !categories.value.some((x) => x.id === selected.value)) {
    selected.value = categories.value[0]?.id ?? null
  }
}
await load()
watch(
  selected,
  (id) => {
    lastCategory.value = id
    if (id && route.query.category !== id) router.replace({ query: { ...route.query, category: id } })
  },
  { immediate: true },
)

const visibleItems = computed(() => items.value.filter((i) => i.category_id === selected.value))
const countIn = (categoryId: string) => items.value.filter((i) => i.category_id === categoryId).length

// Category form
const catOpen = ref(false)
const catForm = reactive({ id: null as string | null, name: '', sort: 0, is_active: true })
const editCategory = (c?: Category) => {
  Object.assign(
    catForm,
    c
      ? { id: c.id, name: c.name, sort: c.sort, is_active: c.is_active }
      : { id: null, name: '', sort: categories.value.length, is_active: true },
  )
  catOpen.value = true
}
const saveCategory = async () => {
  const body = { name: catForm.name, sort: catForm.sort, is_active: catForm.is_active }
  const ok = await run(async () => {
    const saved = catForm.id
      ? await unwrap(api.PATCH('/v1/categories/{id}', { params: { path: { id: catForm.id } }, body }))
      : await unwrap(api.POST('/v1/categories', { body }))
    selected.value = saved.id
  })
  if (ok) {
    catOpen.value = false
    await load()
  }
}
const archiveCategory = async (c: Category) => {
  if (!confirm(t('menu.confirm_archive_category', { name: c.name }))) return
  if (
    await run(() => unwrap(api.DELETE('/v1/categories/{id}', { params: { path: { id: c.id } } })), {
      success: t('common.archived'),
    })
  ) {
    await load()
  }
}

// Item form
const itemOpen = ref(false)
const itemForm = reactive({
  id: null as string | null,
  name: '',
  price: null as number | null,
  color: 'neutral' as ItemColor,
  sort: 0,
  is_active: true,
})
const editItem = (i?: Item) => {
  Object.assign(
    itemForm,
    i
      ? {
          id: i.id,
          name: i.name,
          price: i.price,
          color: i.color as ItemColor,
          sort: i.sort,
          is_active: i.is_active,
        }
      : {
          id: null,
          name: '',
          price: null,
          color: 'neutral',
          sort: visibleItems.value.length,
          is_active: true,
        },
  )
  itemOpen.value = true
}
const saveItem = async () => {
  if (itemForm.price === null || !selected.value) return
  const body = {
    name: itemForm.name,
    price: itemForm.price,
    color: itemForm.color,
    sort: itemForm.sort,
    is_active: itemForm.is_active,
  }
  const categoryId = selected.value
  const ok = await run(() =>
    itemForm.id
      ? unwrap(api.PATCH('/v1/items/{id}', { params: { path: { id: itemForm.id } }, body }))
      : unwrap(api.POST('/v1/items', { body: { ...body, category_id: categoryId } })),
  )
  if (ok) {
    itemOpen.value = false
    await load()
  }
}
const setAvailable = async (i: Item, value: boolean) => {
  if (
    await run(
      () =>
        unwrap(
          api.PATCH('/v1/items/{id}/availability', {
            params: { path: { id: i.id } },
            body: { is_available: value },
          }),
        ),
      { success: false },
    )
  ) {
    i.is_available = value
  }
}
const archiveItem = async (i: Item) => {
  if (!confirm(t('menu.confirm_archive_item', { name: i.name }))) return
  if (
    await run(() => unwrap(api.DELETE('/v1/items/{id}', { params: { path: { id: i.id } } })), {
      success: t('common.archived'),
    })
  ) {
    await load()
  }
}

const colorItems = computed(() => ITEM_COLORS.map((c) => ({ label: t(`colors.${c}`), value: c })))
</script>

<template>
  <PagePanel :title="t('nav.menu')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('menu.add_category')" variant="soft" @click="editCategory()" />
    </template>

    <div v-if="categories.length === 0" class="text-center py-16 flex flex-col items-center gap-3">
      <p class="text-muted">{{ t('menu.empty_categories') }}</p>
      <UButton icon="i-lucide-plus" :label="t('menu.add_category')" @click="editCategory()" />
    </div>

    <div v-else class="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <div class="flex flex-col gap-1" data-testid="categories">
        <div
          v-for="c in categories"
          :key="c.id"
          class="flex items-center gap-1 rounded-md"
          :class="selected === c.id ? 'bg-(--ui-bg-elevated)' : ''"
        >
          <UButton
            variant="ghost"
            color="neutral"
            class="flex-1 justify-between"
            :class="{ 'opacity-60': !c.is_active }"
            @click="selected = c.id"
          >
            <span class="truncate">{{ c.name }}</span>
            <UBadge color="neutral" variant="subtle" :label="String(countIn(c.id))" />
          </UButton>
          <UDropdownMenu
            :items="[
              { label: t('common.edit'), icon: 'i-lucide-pencil', onSelect: () => editCategory(c) },
              {
                label: t('common.archive'),
                icon: 'i-lucide-archive',
                color: 'error',
                onSelect: () => archiveCategory(c),
              },
            ]"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              variant="ghost"
              color="neutral"
              :aria-label="t('common.more')"
            />
          </UDropdownMenu>
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">{{ categories.find((c) => c.id === selected)?.name }}</h2>
          <UButton icon="i-lucide-plus" :label="t('menu.add_item')" @click="editItem()" />
        </div>
        <p v-if="visibleItems.length === 0" class="text-muted py-8 text-center">
          {{ t('menu.empty_items') }}
        </p>
        <div
          v-else
          class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md"
          data-testid="items"
        >
          <div v-for="i in visibleItems" :key="i.id" class="flex flex-wrap items-center gap-3 p-3">
            <span
              class="size-4 rounded-full shrink-0"
              :style="{ background: COLOR_SWATCH[i.color as ItemColor] }"
            />
            <NuxtLink
              :to="`/menu/items/${i.id}`"
              class="flex-1 min-w-40 font-medium hover:underline"
              :class="{ 'opacity-60': !i.is_active }"
            >
              {{ i.name }}
              <span v-if="i.modifier_group_ids.length" class="text-xs text-muted ms-1">
                · {{ t('menu.n_modifier_groups', { n: i.modifier_group_ids.length }) }}
              </span>
            </NuxtLink>
            <span class="tabular-nums">{{ formatIdr(i.price) }}</span>
            <USwitch
              :model-value="i.is_available"
              :label="i.is_available ? t('menu.available') : t('menu.sold_out')"
              @update:model-value="(v: boolean) => setAvailable(i, v)"
            />
            <UDropdownMenu
              :items="[
                { label: t('common.edit'), icon: 'i-lucide-pencil', onSelect: () => editItem(i) },
                {
                  label: t('menu.recipe_and_modifiers'),
                  icon: 'i-lucide-flask-conical',
                  to: `/menu/items/${i.id}`,
                },
                {
                  label: t('common.archive'),
                  icon: 'i-lucide-archive',
                  color: 'error',
                  onSelect: () => archiveItem(i),
                },
              ]"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                variant="ghost"
                color="neutral"
                :aria-label="t('common.more')"
              />
            </UDropdownMenu>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="catOpen" :title="catForm.id ? t('menu.edit_category') : t('menu.add_category')">
      <template #body>
        <UForm id="category-form" :state="catForm" class="flex flex-col gap-4" @submit="saveCategory">
          <UFormField :label="t('common.name')" name="name" required>
            <UInput v-model="catForm.name" class="w-full" autofocus />
          </UFormField>
          <UFormField :label="t('common.sort')" name="sort">
            <UInputNumber v-model="catForm.sort" :min="0" class="w-full" />
          </UFormField>
          <USwitch v-model="catForm.is_active" :label="t('common.active')" />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="category-form"
          :label="t('common.save')"
          :disabled="!catForm.name.trim()"
        />
      </template>
    </UModal>

    <UModal v-model:open="itemOpen" :title="itemForm.id ? t('menu.edit_item') : t('menu.add_item')">
      <template #body>
        <UForm id="item-form" :state="itemForm" class="flex flex-col gap-4" @submit="saveItem">
          <UFormField :label="t('common.name')" name="name" required>
            <UInput v-model="itemForm.name" class="w-full" autofocus />
          </UFormField>
          <UFormField :label="t('menu.price')" :help="t('menu.price_help')" name="price" required>
            <MoneyInput v-model="itemForm.price" />
          </UFormField>
          <UFormField :label="t('menu.color')" name="color">
            <USelect v-model="itemForm.color" :items="colorItems" class="w-full" />
          </UFormField>
          <UFormField :label="t('common.sort')" name="sort">
            <UInputNumber v-model="itemForm.sort" :min="0" class="w-full" />
          </UFormField>
          <USwitch v-model="itemForm.is_active" :label="t('menu.show_in_pos')" />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="item-form"
          :label="t('common.save')"
          :disabled="!itemForm.name.trim() || itemForm.price === null"
        />
      </template>
    </UModal>
  </PagePanel>
</template>
