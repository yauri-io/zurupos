<script setup lang="ts">
definePageMeta({ permission: 'menu.manage' })
const { t } = useI18n()
const api = useApi()
const run = useAction()
useHead({ title: () => t('nav.discounts') })

const discounts = ref<Discount[]>([])
const load = async () => {
  discounts.value = (await unwrap(api.GET('/v1/discounts'))).discounts
}
await load()

const open = ref(false)
const form = reactive({
  id: null as string | null,
  name: '',
  kind: 'percent' as 'percent' | 'fixed',
  percent: '',
  amount: null as number | null,
  scope: 'order' as 'item' | 'order',
  is_active: true,
})
const edit = (d?: Discount) => {
  Object.assign(
    form,
    d
      ? {
          id: d.id,
          name: d.name,
          kind: d.kind,
          percent: d.kind === 'percent' ? formatBps(d.value).replace('%', '') : '',
          amount: d.kind === 'fixed' ? d.value : null,
          scope: d.scope,
          is_active: d.is_active,
        }
      : { id: null, name: '', kind: 'percent', percent: '', amount: null, scope: 'order', is_active: true },
  )
  open.value = true
}
const value = computed(() => (form.kind === 'percent' ? parsePercentToBps(form.percent) : form.amount))
const valid = computed(() => form.name.trim() !== '' && value.value !== null && value.value > 0)
const save = async () => {
  if (!valid.value || value.value === null) return
  const body = {
    name: form.name,
    kind: form.kind,
    value: value.value,
    scope: form.scope,
    is_active: form.is_active,
  }
  const { id } = form
  const ok = await run(() =>
    id
      ? unwrap(api.PATCH('/v1/discounts/{id}', { params: { path: { id } }, body }))
      : unwrap(api.POST('/v1/discounts', { body })),
  )
  if (ok) {
    open.value = false
    await load()
  }
}
const archive = async (d: Discount) => {
  if (!confirm(t('discounts.confirm_archive', { name: d.name }))) return
  if (
    await run(() => unwrap(api.DELETE('/v1/discounts/{id}', { params: { path: { id: d.id } } })), {
      success: t('common.archived'),
    })
  ) {
    await load()
  }
}
const describe = (d: Discount) => (d.kind === 'percent' ? formatBps(d.value) : formatIdr(d.value))
</script>

<template>
  <PagePanel :title="t('nav.discounts')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('discounts.add')" @click="edit()" />
    </template>
    <p v-if="discounts.length === 0" class="text-muted text-center py-16">{{ t('discounts.empty') }}</p>
    <div
      v-else
      class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md"
      data-testid="discounts"
    >
      <div
        v-for="d in discounts"
        :key="d.id"
        class="flex flex-wrap items-center gap-3 p-3"
        :class="{ 'opacity-60': !d.is_active }"
      >
        <span class="flex-1 font-medium">{{ d.name }}</span>
        <UBadge variant="subtle" color="neutral" :label="t(`discounts.scope_${d.scope}`)" />
        <span class="tabular-nums">{{ describe(d) }}</span>
        <UButton
          icon="i-lucide-pencil"
          variant="ghost"
          color="neutral"
          :aria-label="t('common.edit')"
          @click="edit(d)"
        />
        <UButton
          icon="i-lucide-archive"
          variant="ghost"
          color="error"
          :aria-label="t('common.archive')"
          @click="archive(d)"
        />
      </div>
    </div>
    <p class="text-xs text-muted mt-4">{{ t('discounts.note') }}</p>

    <UModal v-model:open="open" :title="form.id ? t('discounts.edit') : t('discounts.add')">
      <template #body>
        <UForm id="discount-form" :state="form" class="flex flex-col gap-4" @submit="save">
          <UFormField :label="t('common.name')" name="name" required>
            <UInput v-model="form.name" class="w-full" autofocus />
          </UFormField>
          <UFormField :label="t('discounts.scope')" name="scope">
            <URadioGroup
              v-model="form.scope"
              orientation="horizontal"
              :items="[
                { label: t('discounts.scope_order'), value: 'order' },
                { label: t('discounts.scope_item'), value: 'item' },
              ]"
            />
          </UFormField>
          <UFormField :label="t('discounts.kind')" name="kind">
            <URadioGroup
              v-model="form.kind"
              orientation="horizontal"
              :items="[
                { label: t('discounts.kind_percent'), value: 'percent' },
                { label: t('discounts.kind_fixed'), value: 'fixed' },
              ]"
            />
          </UFormField>
          <UFormField v-if="form.kind === 'percent'" :label="t('discounts.percent')" name="percent">
            <UInput v-model="form.percent" inputmode="decimal" class="w-full">
              <template #trailing><span class="text-muted">%</span></template>
            </UInput>
          </UFormField>
          <UFormField
            v-else
            :label="t('discounts.amount')"
            :help="form.scope === 'item' ? t('discounts.per_unit') : undefined"
            name="amount"
          >
            <MoneyInput v-model="form.amount" />
          </UFormField>
          <USwitch v-model="form.is_active" :label="t('common.active')" />
        </UForm>
      </template>
      <template #footer>
        <UButton type="submit" form="discount-form" :label="t('common.save')" :disabled="!valid" />
      </template>
    </UModal>
  </PagePanel>
</template>
