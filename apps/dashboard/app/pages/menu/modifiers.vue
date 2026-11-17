<script setup lang="ts">
definePageMeta({ permission: 'menu.manage' })
const { t } = useI18n()
const api = useApi()
const run = useAction()
useHead({ title: () => t('nav.modifiers') })

const groups = ref<ModifierGroup[]>([])
const ingredients = ref<Ingredient[]>([])
const load = async () => {
  const [g, i] = await Promise.all([
    unwrap(api.GET('/v1/modifier-groups')),
    unwrap(api.GET('/v1/ingredients')),
  ])
  groups.value = g.groups
  ingredients.value = i.ingredients
}
await load()

// Group form
const groupOpen = ref(false)
const groupForm = reactive({
  id: null as string | null,
  name: '',
  selection: 'single' as 'single' | 'multiple',
  min_select: 0,
  max_select: 1,
  sort: 0,
})
watch(
  () => groupForm.selection,
  (s) => {
    if (s === 'single') {
      groupForm.max_select = 1
      groupForm.min_select = Math.min(groupForm.min_select, 1)
    }
  },
)
const editGroup = (g?: ModifierGroup) => {
  Object.assign(
    groupForm,
    g
      ? {
          id: g.id,
          name: g.name,
          selection: g.selection,
          min_select: g.min_select,
          max_select: g.max_select,
          sort: g.sort,
        }
      : { id: null, name: '', selection: 'single', min_select: 0, max_select: 1, sort: groups.value.length },
  )
  groupOpen.value = true
}
const saveGroup = async () => {
  const { id, ...body } = groupForm
  const ok = await run(() =>
    id
      ? unwrap(api.PATCH('/v1/modifier-groups/{id}', { params: { path: { id } }, body }))
      : unwrap(api.POST('/v1/modifier-groups', { body })),
  )
  if (ok) {
    groupOpen.value = false
    await load()
  }
}
const archiveGroup = async (g: ModifierGroup) => {
  if (!confirm(t('modifiers.confirm_archive_group', { name: g.name }))) return
  if (
    await run(() => unwrap(api.DELETE('/v1/modifier-groups/{id}', { params: { path: { id: g.id } } })), {
      success: t('common.archived'),
    })
  ) {
    await load()
  }
}

// Option form
const optionOpen = ref(false)
const optionForm = reactive({
  id: null as string | null,
  group_id: '',
  name: '',
  price_delta: 0 as number | null,
  is_default: false,
  sort: 0,
  is_active: true,
})
const editOption = (g: ModifierGroup, o?: ModifierOption) => {
  Object.assign(
    optionForm,
    o
      ? {
          id: o.id,
          group_id: g.id,
          name: o.name,
          price_delta: o.price_delta,
          is_default: o.is_default,
          sort: o.sort,
          is_active: o.is_active,
        }
      : {
          id: null,
          group_id: g.id,
          name: '',
          price_delta: 0,
          is_default: false,
          sort: g.options.length,
          is_active: true,
        },
  )
  optionOpen.value = true
}
const saveOption = async () => {
  if (optionForm.price_delta === null) return
  const body = {
    name: optionForm.name,
    price_delta: optionForm.price_delta,
    is_default: optionForm.is_default,
    sort: optionForm.sort,
    is_active: optionForm.is_active,
  }
  const { id, group_id } = optionForm
  const ok = await run(() =>
    id
      ? unwrap(api.PATCH('/v1/modifier-options/{id}', { params: { path: { id } }, body }))
      : unwrap(api.POST('/v1/modifier-options', { body: { ...body, group_id } })),
  )
  if (ok) {
    optionOpen.value = false
    await load()
  }
}
const archiveOption = async (o: ModifierOption) => {
  if (!confirm(t('modifiers.confirm_archive_option', { name: o.name }))) return
  if (
    await run(() => unwrap(api.DELETE('/v1/modifier-options/{id}', { params: { path: { id: o.id } } })), {
      success: t('common.archived'),
    })
  ) {
    await load()
  }
}

// Effects
const effectsOpen = ref(false)
const effectsOption = ref<ModifierOption | null>(null)
const editEffects = (o: ModifierOption) => {
  effectsOption.value = o
  effectsOpen.value = true
}

const rule = (g: ModifierGroup) =>
  g.selection === 'single'
    ? t(g.required ? 'modifiers.rule_single_required' : 'modifiers.rule_single_optional')
    : t('modifiers.rule_multiple', { min: g.min_select, max: g.max_select })
</script>

<template>
  <PagePanel :title="t('nav.modifiers')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('modifiers.add_group')" @click="editGroup()" />
    </template>

    <p v-if="groups.length === 0" class="text-muted text-center py-16">{{ t('modifiers.empty') }}</p>
    <div class="grid gap-4 lg:grid-cols-2" data-testid="groups">
      <UCard v-for="g in groups" :key="g.id">
        <template #header>
          <div class="flex items-center gap-2">
            <div class="flex-1">
              <h2 class="font-semibold">{{ g.name }}</h2>
              <p class="text-xs text-muted">{{ rule(g) }}</p>
            </div>
            <UButton
              icon="i-lucide-pencil"
              variant="ghost"
              color="neutral"
              :aria-label="t('common.edit')"
              @click="editGroup(g)"
            />
            <UButton
              icon="i-lucide-archive"
              variant="ghost"
              color="error"
              :aria-label="t('common.archive')"
              @click="archiveGroup(g)"
            />
          </div>
        </template>
        <div class="flex flex-col divide-y divide-(--ui-border)">
          <div
            v-for="o in g.options"
            :key="o.id"
            class="flex items-center gap-2 py-2"
            :class="{ 'opacity-60': !o.is_active }"
          >
            <span class="flex-1">
              {{ o.name }}
              <UBadge
                v-if="o.is_default"
                size="sm"
                variant="subtle"
                :label="t('modifiers.default')"
                class="ms-1"
              />
            </span>
            <span class="tabular-nums text-sm">{{
              o.price_delta ? `+${formatIdr(o.price_delta)}` : ''
            }}</span>
            <UButton
              size="sm"
              variant="soft"
              icon="i-lucide-flask-conical"
              :label="t('effects.button')"
              @click="editEffects(o)"
            />
            <UButton
              size="sm"
              icon="i-lucide-pencil"
              variant="ghost"
              color="neutral"
              :aria-label="t('common.edit')"
              @click="editOption(g, o)"
            />
            <UButton
              size="sm"
              icon="i-lucide-archive"
              variant="ghost"
              color="error"
              :aria-label="t('common.archive')"
              @click="archiveOption(o)"
            />
          </div>
        </div>
        <template #footer>
          <UButton
            icon="i-lucide-plus"
            variant="soft"
            size="sm"
            :label="t('modifiers.add_option')"
            @click="editOption(g)"
          />
        </template>
      </UCard>
    </div>

    <UModal
      v-model:open="groupOpen"
      :title="groupForm.id ? t('modifiers.edit_group') : t('modifiers.add_group')"
    >
      <template #body>
        <UForm id="group-form" :state="groupForm" class="flex flex-col gap-4" @submit="saveGroup">
          <UFormField :label="t('common.name')" name="name" required>
            <UInput v-model="groupForm.name" class="w-full" autofocus />
          </UFormField>
          <UFormField :label="t('modifiers.selection')" name="selection">
            <URadioGroup
              v-model="groupForm.selection"
              orientation="horizontal"
              :items="[
                { label: t('modifiers.single'), value: 'single' },
                { label: t('modifiers.multiple'), value: 'multiple' },
              ]"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField :label="t('modifiers.min_select')" :help="t('modifiers.min_help')" name="min_select">
              <UInputNumber
                v-model="groupForm.min_select"
                :min="0"
                :max="groupForm.max_select"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('modifiers.max_select')" name="max_select">
              <UInputNumber
                v-model="groupForm.max_select"
                :min="1"
                :disabled="groupForm.selection === 'single'"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField :label="t('common.sort')" name="sort">
            <UInputNumber v-model="groupForm.sort" :min="0" class="w-full" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="group-form"
          :label="t('common.save')"
          :disabled="!groupForm.name.trim()"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="optionOpen"
      :title="optionForm.id ? t('modifiers.edit_option') : t('modifiers.add_option')"
    >
      <template #body>
        <UForm id="option-form" :state="optionForm" class="flex flex-col gap-4" @submit="saveOption">
          <UFormField :label="t('common.name')" name="name" required>
            <UInput v-model="optionForm.name" class="w-full" autofocus />
          </UFormField>
          <UFormField
            :label="t('modifiers.price_delta')"
            :help="t('modifiers.price_delta_help')"
            name="price_delta"
          >
            <MoneyInput v-model="optionForm.price_delta" />
          </UFormField>
          <UFormField :label="t('common.sort')" name="sort">
            <UInputNumber v-model="optionForm.sort" :min="0" class="w-full" />
          </UFormField>
          <USwitch v-model="optionForm.is_default" :label="t('modifiers.default')" />
          <USwitch v-model="optionForm.is_active" :label="t('common.active')" />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="option-form"
          :label="t('common.save')"
          :disabled="!optionForm.name.trim() || optionForm.price_delta === null"
        />
      </template>
    </UModal>

    <EffectsEditor
      v-if="effectsOption"
      v-model:open="effectsOpen"
      :option="effectsOption"
      :ingredients="ingredients"
    />
  </PagePanel>
</template>
