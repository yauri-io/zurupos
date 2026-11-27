<script setup lang="ts">
// One online-menu photo (logo, cover or item photo): preview, choose/replace and
// remove. The parent uploads; this only picks the file (SPEC §12.7).
const props = defineProps<{
  image: OnlineImg | null
  label: string
  // Preview box shape: a square logo, a wide cover, an item photo.
  shape?: 'square' | 'wide' | 'photo'
  busy?: boolean
  testid?: string
}>()
const emit = defineEmits<{ pick: [file: File]; remove: [] }>()
const { t } = useI18n()
const input = ref<HTMLInputElement | null>(null)

const box = computed(
  () =>
    ({
      square: 'size-28 rounded-full',
      wide: 'w-full max-w-md aspect-[16/7] rounded-lg',
      photo: 'size-32 rounded-lg',
    })[props.shape ?? 'photo'],
)

const onChange = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('pick', file)
  // Picking the same file again must fire change again.
  if (input.value) input.value.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-2" :data-testid="testid">
    <span class="text-sm font-medium">{{ label }}</span>
    <div class="flex flex-wrap items-end gap-3">
      <div
        :class="box"
        class="relative overflow-hidden border border-default bg-elevated flex items-center justify-center shrink-0"
      >
        <img
          v-if="image"
          :src="image.url_small"
          :width="image.width"
          :height="image.height"
          alt=""
          class="size-full object-cover"
        />
        <UIcon v-else name="i-lucide-image" class="size-8 text-dimmed" />
        <div v-if="busy" class="absolute inset-0 bg-default/70 flex items-center justify-center">
          <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          :icon="image ? 'i-lucide-replace' : 'i-lucide-upload'"
          variant="soft"
          :label="image ? t('online_menu.photo_replace') : t('online_menu.photo_choose')"
          :disabled="busy"
          data-testid="photo-choose"
          @click="input?.click()"
        />
        <UButton
          v-if="image"
          icon="i-lucide-trash-2"
          variant="ghost"
          color="error"
          :label="t('common.remove')"
          :disabled="busy"
          data-testid="photo-remove"
          @click="emit('remove')"
        />
      </div>
    </div>
    <input
      ref="input"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="hidden"
      data-testid="photo-input"
      @change="onChange"
    />
  </div>
</template>
