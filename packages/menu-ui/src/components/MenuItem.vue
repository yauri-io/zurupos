<script setup lang="ts">
// One item: name, price, Habis, recommended badge, photo when there is one.
// Without a photo the card simply has no photo slot (SPEC §12.7).
import { onMounted, ref } from 'vue'
import { formatIdr } from '../format'
import { translate, type Locale } from '../i18n'
import { srcset } from '../images'
import type { PublicItem } from '../types'

const props = defineProps<{ item: PublicItem; locale: Locale; badge: boolean; eager?: boolean }>()
const broken = ref(false)
const img = ref<HTMLImageElement | null>(null)
// A missing object (e.g. after restoring an old dump) counts as no photo. An
// error before hydration is missed by @error, so check once on mount too.
onMounted(() => {
  if (img.value?.complete && img.value.naturalWidth === 0) broken.value = true
})
const t = (key: Parameters<typeof translate>[1]) => translate(props.locale, key)
</script>

<template>
  <article
    class="zm-item"
    :class="{ 'zm-item--out': item.sold_out, 'zm-item--photo': item.photo && !broken }"
  >
    <img
      v-if="item.photo && !broken"
      ref="img"
      class="zm-item-photo"
      :src="item.photo.url_small"
      :srcset="srcset(item.photo)"
      sizes="(min-width: 720px) 240px, 50vw"
      :width="item.photo.width"
      :height="item.photo.height"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
      alt=""
      @error="broken = true"
    />
    <div class="zm-item-body">
      <div class="zm-item-line">
        <h3 class="zm-item-name">{{ item.name }}</h3>
        <span class="zm-leader" aria-hidden="true" />
        <span class="zm-price">{{ formatIdr(item.price) }}</span>
      </div>
      <p v-if="item.sold_out || (badge && item.recommended)" class="zm-item-badges">
        <span v-if="item.sold_out" class="zm-badge zm-badge--out">{{ t('sold_out') }}</span>
        <span v-if="badge && item.recommended" class="zm-badge zm-badge--rec">★ {{ t('recommended') }}</span>
      </p>
    </div>
  </article>
</template>
