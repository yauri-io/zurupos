<script setup lang="ts">
// Staff (owner): add managers (invited by email), cashiers and employees (PIN only);
// change name/role/language, reset PIN, deactivate.
definePageMeta({ permission: 'users.manage' })
const { t, locale } = useI18n()
const api = useApi()
const run = useAction()
const { me } = useAuth()
useHead({ title: () => t('nav.users') })

const users = ref<User[]>([])
const load = async () => {
  users.value = (await unwrap(api.GET('/v1/users'))).users
}
await load()
const tz = computed(() => me.value?.tenant.timezone ?? 'Asia/Jakarta')

type StaffRole = 'manager' | 'cashier' | 'employee'
const open = ref(false)
const form = reactive({
  id: null as string | null,
  name: '',
  role: 'cashier' as StaffRole,
  email: '',
  pin: '',
  locale: 'id' as 'id' | 'en',
})
const edit = (u?: User) => {
  Object.assign(
    form,
    u
      ? { id: u.id, name: u.name, role: u.role, email: u.email ?? '', pin: '', locale: u.locale }
      : { id: null, name: '', role: 'cashier', email: '', pin: '', locale: 'id' },
  )
  open.value = true
}
const pinOk = (pin: string) => /^\d{4,6}$/.test(pin)
const valid = computed(
  () =>
    form.name.trim() !== '' &&
    (form.id !== null || pinOk(form.pin)) &&
    (form.role !== 'manager' || /\S+@\S+\.\S+/.test(form.email.trim())),
)
const save = async () => {
  const email = form.email.trim()
  const { id } = form
  const ok = await run(() =>
    id
      ? unwrap(
          api.PATCH('/v1/users/{id}', {
            params: { path: { id } },
            body: {
              name: form.name.trim(),
              role: form.role,
              locale: form.locale,
              ...(email ? { email } : {}),
            },
          }),
        )
      : unwrap(
          api.POST('/v1/users', {
            body: {
              name: form.name.trim(),
              role: form.role,
              pin: form.pin,
              locale: form.locale,
              ...(email ? { email } : {}),
            },
          }),
        ),
  )
  if (ok) {
    open.value = false
    await load()
  }
}

const pinFor = ref<User | null>(null)
const newPin = ref('')
const resetPin = async () => {
  const u = pinFor.value
  if (!u || !pinOk(newPin.value)) return
  if (
    await run(() =>
      unwrap(
        api.POST('/v1/users/{id}/reset-pin', { params: { path: { id: u.id } }, body: { pin: newPin.value } }),
      ),
    )
  ) {
    pinFor.value = null
    newPin.value = ''
  }
}
const deactivate = async (u: User) => {
  if (!confirm(t('users.confirm_deactivate', { name: u.name }))) return
  if (await run(() => unwrap(api.POST('/v1/users/{id}/deactivate', { params: { path: { id: u.id } } }))))
    await load()
}
const roleItems = computed(() =>
  (['manager', 'cashier', 'employee'] as const).map((value) => ({ value, label: t(`roles.${value}`) })),
)
const localeItems = [
  { value: 'id' as const, label: 'Bahasa Indonesia' },
  { value: 'en' as const, label: 'English' },
]
</script>

<template>
  <PagePanel :title="t('nav.users')">
    <template #actions>
      <UButton icon="i-lucide-user-plus" :label="t('users.add')" @click="edit()" />
    </template>
    <div
      class="flex flex-col divide-y divide-(--ui-border) border border-default rounded-md"
      data-testid="users"
    >
      <div
        v-for="u in users"
        :key="u.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-1 p-3"
        :class="{ 'opacity-50': !u.is_active }"
      >
        <div class="flex-1 min-w-48">
          <p class="font-medium">
            {{ u.name }}
            <UBadge :label="t(`roles.${u.role}`)" variant="subtle" color="neutral" size="sm" class="ms-1" />
            <UBadge
              v-if="!u.is_active"
              :label="t('users.inactive')"
              variant="subtle"
              color="error"
              size="sm"
              class="ms-1"
            />
            <UBadge
              v-else-if="u.role === 'manager' && !u.has_password"
              :label="t('users.invite_pending')"
              variant="subtle"
              color="warning"
              size="sm"
              class="ms-1"
            />
          </p>
          <p class="text-xs text-muted">
            <template v-if="u.email">{{ u.email }} · </template>
            {{
              u.last_login_at
                ? t('users.last_login', { at: formatDateTime(u.last_login_at, tz, locale) })
                : t('users.never')
            }}
          </p>
        </div>
        <template v-if="u.is_active && u.role !== 'owner'">
          <UButton
            icon="i-lucide-pencil"
            variant="ghost"
            color="neutral"
            :aria-label="t('common.edit')"
            @click="edit(u)"
          />
          <UButton
            icon="i-lucide-key-round"
            variant="ghost"
            color="neutral"
            :aria-label="t('users.reset_pin')"
            @click="pinFor = u"
          />
          <UButton
            icon="i-lucide-user-x"
            variant="ghost"
            color="error"
            :aria-label="t('users.deactivate')"
            @click="deactivate(u)"
          />
        </template>
      </div>
    </div>

    <UModal v-model:open="open" :title="form.id ? t('users.edit') : t('users.add')">
      <template #body>
        <UForm id="user-form" :state="form" class="flex flex-col gap-4" @submit="save">
          <UFormField :label="t('common.name')" name="name" required>
            <UInput v-model="form.name" class="w-full" :maxlength="80" autofocus />
          </UFormField>
          <UFormField :label="t('users.role')" name="role">
            <USelect v-model="form.role" :items="roleItems" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('users.email')"
            :help="form.role === 'manager' ? t('users.email_manager_help') : t('users.email_optional')"
            name="email"
            :required="form.role === 'manager'"
          >
            <UInput v-model="form.email" type="email" class="w-full" />
          </UFormField>
          <UFormField v-if="!form.id" :label="t('users.pin')" :help="t('users.pin_help')" name="pin" required>
            <UInput v-model="form.pin" inputmode="numeric" :maxlength="6" class="w-full" />
          </UFormField>
          <UFormField :label="t('users.language')" name="locale">
            <USelect v-model="form.locale" :items="localeItems" class="w-full" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton type="submit" form="user-form" :label="t('common.save')" :disabled="!valid" />
      </template>
    </UModal>

    <UModal
      :open="pinFor !== null"
      :title="t('users.reset_pin_for', { name: pinFor?.name ?? '' })"
      @update:open="(v) => !v && (pinFor = null)"
    >
      <template #body>
        <UFormField :label="t('users.pin')" :help="t('users.pin_help')" name="new-pin">
          <UInput v-model="newPin" inputmode="numeric" :maxlength="6" class="w-full" autofocus />
        </UFormField>
      </template>
      <template #footer>
        <UButton :label="t('common.save')" :disabled="!pinOk(newPin)" @click="resetPin" />
      </template>
    </UModal>
  </PagePanel>
</template>
