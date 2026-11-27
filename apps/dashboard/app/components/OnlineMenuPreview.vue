<script setup lang="ts">
// Live preview of the online menu (SPEC §12.7): the real page from
// @zurupos/menu-ui with this shop's data from /online-menu/preview, following
// the unsaved template and colour. A preview never counts as a view (D-083).
import { MenuPage, type PublicMenu } from '@zurupos/menu-ui'

const props = defineProps<{
  template: 'foto' | 'papan' | 'hangat'
  accent: string
  // Changes whenever saved data changes (photos, profile, hours …).
  version: unknown
}>()
const api = useApi()
const { locale } = useI18n()
const notify = useNotify()

const menu = ref<PublicMenu | null>(null)
const valid = (hex: string) => /^#[0-9a-fA-F]{6}$/.test(hex)
let timer: ReturnType<typeof setTimeout> | undefined
const load = async () => {
  try {
    menu.value = await unwrap(
      api.GET('/v1/online-menu/preview', {
        params: {
          query: { template: props.template, ...(valid(props.accent) ? { accent_color: props.accent } : {}) },
        },
      }),
    )
  } catch (err) {
    notify.failed(err)
  }
}
watch(
  () => [props.template, props.accent, props.version],
  () => {
    clearTimeout(timer)
    timer = setTimeout(load, 250)
  },
  { deep: true },
)
onBeforeUnmount(() => clearTimeout(timer))
await load()
</script>

<template>
  <div
    class="mx-auto w-[375px] max-w-full rounded-[2rem] border-8 border-neutral-800 bg-neutral-800 shadow-xl"
  >
    <div
      class="h-[700px] max-h-[calc(100vh-10rem)] overflow-y-auto rounded-[1.5rem] bg-white"
      data-testid="menu-preview"
    >
      <MenuPage
        v-if="menu"
        :menu="menu"
        :locale="locale === 'en' ? 'en' : 'id'"
        landing-url="https://zurupos.com"
        preview
      />
    </div>
  </div>
</template>
