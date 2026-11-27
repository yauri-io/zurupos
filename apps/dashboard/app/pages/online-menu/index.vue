<script setup lang="ts">
// Online menu, owner only (SPEC §12.7, PRD F18). Mobile first: one column of
// cards. The live preview and the views card come in O2 and O3.
definePageMeta({ permission: 'online_menu.manage' })
const { t } = useI18n()
const api = useApi()
const run = useAction()
const notify = useNotify()
const sendFile = useUpload()
useHead({ title: () => t('nav.online_menu') })

// Live preview (SPEC §12.7): rendered only where it is visible.
const previewOpen = ref(false)
const wide = ref(false)
const wideQuery = import.meta.client ? window.matchMedia('(min-width: 1280px)') : null
const onWide = (e: MediaQueryListEvent) => (wide.value = e.matches)
onMounted(() => {
  wide.value = wideQuery?.matches ?? false
  wideQuery?.addEventListener('change', onWide)
})
onBeforeUnmount(() => wideQuery?.removeEventListener('change', onWide))

const menu = ref<OnlineMenu>(await unwrap(api.GET('/v1/online-menu')))

// --- Status: link, publish, QR.
const slugDraft = ref(menu.value.slug ?? suggestSlug(menu.value.name))
const editingSlug = ref(menu.value.slug === null)
const slugValid = computed(() => SLUG_RE.test(slugDraft.value))
const saveSlug = async () => {
  if (!slugValid.value) return
  const ok = await run(async () => {
    menu.value = await unwrap(api.PATCH('/v1/online-menu', { body: { slug: slugDraft.value } }))
  })
  if (ok) editingSlug.value = false
}
const publishing = ref(false)
const setPublished = async (on: boolean) => {
  publishing.value = true
  await run(
    async () => {
      menu.value = await unwrap(
        on ? api.POST('/v1/online-menu/publish') : api.POST('/v1/online-menu/unpublish'),
      )
    },
    { success: on ? t('online_menu.published_toast') : t('online_menu.unpublished_toast') },
  )
  publishing.value = false
}
const copied = ref(false)
const copyLink = async () => {
  if (!menu.value.public_url) return
  try {
    await navigator.clipboard.writeText(menu.value.public_url)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch (err) {
    notify.failed(err)
  }
}
const qrPreview = ref<string | null>(null)
watch(
  () => menu.value.qr_url,
  async (url) => {
    qrPreview.value = url ? await qrDataUrl(url, 320) : null
  },
  { immediate: true },
)
const downloadQr = async () => {
  if (!menu.value.qr_url || !menu.value.slug) return
  downloadDataUrl(await qrDataUrl(menu.value.qr_url), `menu-${menu.value.slug}-qr.png`)
}

// --- Tampilan and Profil (one PATCH each).
const TEMPLATES = ['foto', 'papan', 'hangat'] as const
const look = ref({ template: menu.value.template, accent_color: menu.value.accent_color })
const accentValid = computed(() => /^#[0-9a-fA-F]{6}$/.test(look.value.accent_color))
const saveLook = () =>
  run(async () => {
    menu.value = await unwrap(
      api.PATCH('/v1/online-menu', {
        body: { template: look.value.template, accent_color: look.value.accent_color },
      }),
    )
  })

const profile = ref({
  description: menu.value.description ?? '',
  whatsapp: whatsappForDisplay(menu.value.whatsapp),
  instagram: menu.value.instagram ?? '',
  maps_url: menu.value.maps_url ?? '',
})
const whatsapp = computed(() => normalizeWhatsapp(profile.value.whatsapp))
const instagram = computed(() => normalizeInstagram(profile.value.instagram))
const descriptionLeft = computed(() => menu.value.limits.description - profile.value.description.length)
const profileValid = computed(
  () => whatsapp.value !== 'invalid' && instagram.value !== 'invalid' && descriptionLeft.value >= 0,
)
const saveProfile = () =>
  run(async () => {
    if (whatsapp.value === 'invalid' || instagram.value === 'invalid') return
    menu.value = await unwrap(
      api.PATCH('/v1/online-menu', {
        body: {
          description: profile.value.description.trim() === '' ? null : profile.value.description,
          whatsapp: whatsapp.value,
          instagram: instagram.value,
          maps_url: profile.value.maps_url.trim() === '' ? null : profile.value.maps_url.trim(),
        },
      }),
    )
  })

// --- Photos. Each is shrunk in the browser first (D-079).
const busy = ref({ logo: false, cover: false, gallery: false })
const uploadTo = async (slot: 'logo' | 'cover' | 'gallery', file: File) => {
  busy.value[slot] = true
  await run(async () => {
    const blob = await downsizeForUpload(file)
    menu.value =
      slot === 'gallery'
        ? await sendFile<OnlineMenu>('POST', '/v1/online-menu/gallery', blob)
        : await sendFile<OnlineMenu>('PUT', `/v1/online-menu/${slot}`, blob)
  })
  busy.value[slot] = false
}
const removeImage = async (slot: 'logo' | 'cover') => {
  busy.value[slot] = true
  await run(async () => {
    menu.value = await unwrap(
      slot === 'logo' ? api.DELETE('/v1/online-menu/logo') : api.DELETE('/v1/online-menu/cover'),
    )
  })
  busy.value[slot] = false
}
const removeGallery = async (id: string) => {
  busy.value.gallery = true
  await run(async () => {
    menu.value = await unwrap(api.DELETE('/v1/online-menu/gallery/{id}', { params: { path: { id } } }))
  })
  busy.value.gallery = false
}
const galleryInput = ref<HTMLInputElement | null>(null)
const galleryFull = computed(() => menu.value.gallery.length >= menu.value.limits.gallery)
const onGalleryPick = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (galleryInput.value) galleryInput.value.value = ''
  if (file) await uploadTo('gallery', file)
}

// --- Jam buka: seven rows, a switch per day.
const hours = ref(hoursRows(menu.value.hours))
const hoursValid = computed(() =>
  hours.value.every((h) => !h.open || (h.opens !== '' && h.closes !== '' && h.opens !== h.closes)),
)
const saveHours = () =>
  run(async () => {
    menu.value = await unwrap(api.PUT('/v1/online-menu/hours', { body: { hours: hoursBody(hours.value) } }))
    hours.value = hoursRows(menu.value.hours)
  })
const copyToAll = (row: HoursRow) => {
  hours.value = hours.value.map((h) => ({ ...h, open: row.open, opens: row.opens, closes: row.closes }))
}
</script>

<template>
  <PagePanel :title="t('nav.online_menu')">
    <template #actions>
      <UButton
        class="xl:hidden"
        icon="i-lucide-smartphone"
        variant="soft"
        :label="t('online_menu.preview')"
        data-testid="preview-open"
        @click="previewOpen = true"
      />
    </template>
    <div class="grid gap-6 xl:grid-cols-[minmax(0,42rem)_auto] xl:items-start">
      <div class="flex flex-col gap-6 min-w-0">
        <p class="text-sm text-muted">{{ t('online_menu.intro') }}</p>

        <!-- Status -->
        <UCard data-testid="status-card">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-semibold">{{ t('online_menu.status') }}</h2>
              <UBadge
                :color="menu.is_published ? 'success' : 'neutral'"
                variant="subtle"
                :label="menu.is_published ? t('online_menu.live') : t('online_menu.off')"
                data-testid="status-badge"
              />
            </div>
          </template>
          <div class="flex flex-col gap-5">
            <div v-if="editingSlug" class="flex flex-col gap-2" data-testid="slug-form">
              <UFormField
                :label="t('online_menu.slug')"
                :help="t('online_menu.slug_help')"
                :error="slugDraft !== '' && !slugValid ? t('online_menu.slug_invalid') : undefined"
              >
                <UInput
                  v-model="slugDraft"
                  class="w-full"
                  autocapitalize="off"
                  autocomplete="off"
                  spellcheck="false"
                  data-testid="slug-input"
                  @update:model-value="(v) => (slugDraft = String(v).toLowerCase().replace(/\s+/g, '-'))"
                >
                  <template #leading>
                    <span class="text-muted text-sm">{{ t('online_menu.slug_prefix') }}</span>
                  </template>
                </UInput>
              </UFormField>
              <p v-if="menu.slug" class="text-xs text-muted">{{ t('online_menu.slug_change_note') }}</p>
              <div class="flex gap-2">
                <UButton
                  :label="t('online_menu.slug_save')"
                  :disabled="!slugValid"
                  data-testid="slug-save"
                  @click="saveSlug"
                />
                <UButton
                  v-if="menu.slug"
                  variant="ghost"
                  color="neutral"
                  :label="t('online_menu.cancel')"
                  @click="
                    () => {
                      slugDraft = menu.slug ?? ''
                      editingSlug = false
                    }
                  "
                />
              </div>
            </div>

            <template v-else>
              <div class="flex flex-col gap-1">
                <span class="text-sm font-medium">{{ t('online_menu.link') }}</span>
                <div class="flex flex-wrap items-center gap-2">
                  <code class="text-sm break-all bg-elevated rounded px-2 py-1" data-testid="public-url">{{
                    menu.public_url
                  }}</code>
                  <UButton
                    size="sm"
                    variant="ghost"
                    :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
                    :label="copied ? t('online_menu.copied') : t('online_menu.copy')"
                    @click="copyLink"
                  />
                  <UButton
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-pencil"
                    :label="t('online_menu.slug_change')"
                    data-testid="slug-change"
                    @click="editingSlug = true"
                  />
                </div>
              </div>

              <div class="flex items-center gap-1">
                <USwitch
                  :model-value="menu.is_published"
                  :loading="publishing"
                  :label="t('online_menu.publish')"
                  :description="
                    menu.is_published ? t('online_menu.publish_on_help') : t('online_menu.publish_off_help')
                  "
                  data-testid="publish-switch"
                  @update:model-value="(v) => setPublished(v === true)"
                />
              </div>

              <div class="flex flex-col sm:flex-row gap-4 sm:items-center">
                <img
                  v-if="qrPreview"
                  :src="qrPreview"
                  width="160"
                  height="160"
                  :alt="t('online_menu.qr_alt')"
                  class="size-40 rounded border border-default bg-white"
                  data-testid="qr-preview"
                />
                <div class="flex flex-col gap-2 items-start">
                  <p class="text-sm text-muted">{{ t('online_menu.qr_help') }}</p>
                  <UButton
                    icon="i-lucide-download"
                    variant="soft"
                    :label="t('online_menu.qr_download')"
                    data-testid="qr-download"
                    @click="downloadQr"
                  />
                  <UButton
                    icon="i-lucide-printer"
                    variant="soft"
                    :label="t('online_menu.qr_card')"
                    to="/online-menu/card"
                    target="_blank"
                    data-testid="qr-card"
                  />
                  <UButton
                    icon="i-lucide-external-link"
                    variant="ghost"
                    :label="t('online_menu.open_page')"
                    :to="menu.public_url ?? undefined"
                    target="_blank"
                    external
                  />
                </div>
              </div>
            </template>
          </div>
        </UCard>

        <!-- Dilihat (F19): only once the menu has an address. -->
        <OnlineMenuViews v-if="menu.slug" />

        <!-- Tampilan -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">{{ t('online_menu.look') }}</h2>
            <p class="text-sm text-muted">{{ t('online_menu.look_help') }}</p>
          </template>
          <div class="flex flex-col gap-5">
            <URadioGroup
              v-model="look.template"
              variant="card"
              :items="
                TEMPLATES.map((v) => ({
                  value: v,
                  label: t(`online_menu.templates.${v}`),
                  description: t(`online_menu.templates.${v}_help`),
                }))
              "
              data-testid="templates"
            />
            <UFormField
              :label="t('online_menu.accent')"
              :help="t('online_menu.accent_help')"
              :error="accentValid ? undefined : t('online_menu.accent_invalid')"
            >
              <div class="flex items-center gap-3">
                <input
                  type="color"
                  :value="accentValid ? look.accent_color.toLowerCase() : '#000000'"
                  class="h-10 w-14 cursor-pointer rounded border border-default bg-transparent"
                  :aria-label="t('online_menu.accent')"
                  @input="(e) => (look.accent_color = (e.target as HTMLInputElement).value)"
                />
                <UInput v-model="look.accent_color" class="w-32" maxlength="7" data-testid="accent-input" />
              </div>
            </UFormField>
            <UButton
              class="self-start"
              :label="t('common.save')"
              :disabled="!accentValid"
              data-testid="save-look"
              @click="saveLook"
            />
          </div>
        </UCard>

        <!-- Profil -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">{{ t('online_menu.profile') }}</h2>
            <p class="text-sm text-muted">{{ t('online_menu.profile_help') }}</p>
          </template>
          <div class="flex flex-col gap-5">
            <PhotoSlot
              :image="menu.logo"
              :label="t('online_menu.logo')"
              shape="square"
              :busy="busy.logo"
              testid="logo"
              @pick="(f) => uploadTo('logo', f)"
              @remove="removeImage('logo')"
            />
            <PhotoSlot
              :image="menu.cover"
              :label="t('online_menu.cover')"
              shape="wide"
              :busy="busy.cover"
              testid="cover"
              @pick="(f) => uploadTo('cover', f)"
              @remove="removeImage('cover')"
            />
            <p class="text-xs text-muted -mt-2">{{ t('online_menu.photo_note') }}</p>

            <UFormField :label="t('online_menu.description')" :help="t('online_menu.description_help')">
              <template #hint>
                <span
                  :class="descriptionLeft < 0 ? 'text-error' : 'text-muted'"
                  class="text-xs tabular-nums"
                  data-testid="description-counter"
                >
                  {{ profile.description.length }}/{{ menu.limits.description }}
                </span>
              </template>
              <UTextarea
                v-model="profile.description"
                :rows="3"
                class="w-full"
                autoresize
                data-testid="description"
              />
            </UFormField>

            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium">{{ t('online_menu.address') }}</span>
              <p class="text-sm" :class="menu.address ? '' : 'text-muted'" data-testid="address">
                {{ menu.address ?? t('online_menu.no_address') }}
              </p>
              <ULink to="/settings" class="text-sm text-primary">{{ t('online_menu.address_edit') }}</ULink>
            </div>

            <UFormField
              :label="t('online_menu.whatsapp')"
              :help="t('online_menu.whatsapp_help')"
              :error="whatsapp === 'invalid' ? t('online_menu.whatsapp_invalid') : undefined"
            >
              <UInput
                v-model="profile.whatsapp"
                inputmode="tel"
                placeholder="0812 3456 7890"
                class="w-full"
                data-testid="whatsapp"
              />
            </UFormField>
            <UFormField
              :label="t('online_menu.instagram')"
              :error="instagram === 'invalid' ? t('online_menu.instagram_invalid') : undefined"
            >
              <UInput
                v-model="profile.instagram"
                placeholder="kopisenja"
                class="w-full"
                autocapitalize="off"
                data-testid="instagram"
              >
                <template #leading><span class="text-muted">@</span></template>
              </UInput>
            </UFormField>
            <UFormField :label="t('online_menu.maps')" :help="t('online_menu.maps_help')">
              <UInput
                v-model="profile.maps_url"
                inputmode="url"
                placeholder="https://maps.app.goo.gl/…"
                class="w-full"
                data-testid="maps"
              />
            </UFormField>
            <UButton
              class="self-start"
              :label="t('common.save')"
              :disabled="!profileValid"
              data-testid="save-profile"
              @click="saveProfile"
            />
          </div>
        </UCard>

        <!-- Jam buka -->
        <UCard>
          <template #header>
            <h2 class="font-semibold">{{ t('online_menu.hours') }}</h2>
            <p class="text-sm text-muted">{{ t('online_menu.hours_help') }}</p>
          </template>
          <div class="flex flex-col gap-3" data-testid="hours">
            <div
              v-for="row in hours"
              :key="row.weekday"
              class="flex flex-wrap items-center gap-x-3 gap-y-2"
              :data-testid="`hours-${row.weekday}`"
            >
              <USwitch
                v-model="row.open"
                class="w-28 shrink-0"
                :label="t(`online_menu.weekdays.${row.weekday}`)"
              />
              <template v-if="row.open">
                <UInput v-model="row.opens" type="time" class="w-28" :aria-label="t('online_menu.opens')" />
                <span class="text-muted">–</span>
                <UInput v-model="row.closes" type="time" class="w-28" :aria-label="t('online_menu.closes')" />
                <UButton
                  v-if="row.weekday === 1"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :label="t('online_menu.copy_to_all')"
                  @click="copyToAll(row)"
                />
              </template>
              <span v-else class="text-sm text-muted">{{ t('online_menu.closed') }}</span>
            </div>
            <p class="text-xs text-muted">{{ t('online_menu.hours_midnight') }}</p>
            <UButton
              class="self-start"
              :label="t('common.save')"
              :disabled="!hoursValid"
              data-testid="save-hours"
              @click="saveHours"
            />
          </div>
        </UCard>

        <!-- Galeri -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-semibold">{{ t('online_menu.gallery') }}</h2>
              <span class="text-sm text-muted tabular-nums" data-testid="gallery-count"
                >{{ menu.gallery.length }}/{{ menu.limits.gallery }}</span
              >
            </div>
            <p class="text-sm text-muted">{{ t('online_menu.gallery_help') }}</p>
          </template>
          <div class="flex flex-col gap-4">
            <div
              v-if="menu.gallery.length"
              class="grid grid-cols-2 sm:grid-cols-3 gap-3"
              data-testid="gallery"
            >
              <div v-for="g in menu.gallery" :key="g.id" class="relative">
                <img
                  :src="g.image.url_small"
                  :width="g.image.width"
                  :height="g.image.height"
                  alt=""
                  class="w-full aspect-square object-cover rounded-lg border border-default"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="error"
                  size="sm"
                  class="absolute top-1.5 right-1.5"
                  :aria-label="t('common.remove')"
                  :disabled="busy.gallery"
                  @click="removeGallery(g.id)"
                />
              </div>
            </div>
            <p v-else class="text-sm text-muted">{{ t('online_menu.gallery_empty') }}</p>
            <UButton
              class="self-start"
              icon="i-lucide-plus"
              variant="soft"
              :loading="busy.gallery"
              :disabled="galleryFull || busy.gallery"
              :label="galleryFull ? t('online_menu.gallery_full') : t('online_menu.gallery_add')"
              data-testid="gallery-add"
              @click="galleryInput?.click()"
            />
            <input
              ref="galleryInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="hidden"
              data-testid="gallery-input"
              @change="onGalleryPick"
            />
          </div>
        </UCard>
      </div>
      <!-- Live preview: beside the form on wide screens, behind a button on phones. -->
      <aside class="hidden xl:block sticky top-4">
        <p class="text-sm text-muted mb-2 text-center">{{ t('online_menu.preview_help') }}</p>
        <OnlineMenuPreview
          v-if="wide"
          :template="look.template"
          :accent="look.accent_color"
          :version="menu"
        />
      </aside>
    </div>
    <UModal v-model:open="previewOpen" fullscreen :title="t('online_menu.preview')">
      <template #body>
        <OnlineMenuPreview :template="look.template" :accent="look.accent_color" :version="menu" />
      </template>
    </UModal>
  </PagePanel>
</template>
