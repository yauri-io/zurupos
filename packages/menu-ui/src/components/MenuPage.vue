<script setup lang="ts">
// The online menu page (SPEC §12.7, D-078, D-082), rendered by apps/menu and by
// the dashboard's live preview. Fixed order: cover → logo, name, description →
// today's hours and the week → address and contact buttons → Rekomendasi →
// category tabs and sections → gallery → price note → footer. Missing parts
// are left out without gaps. Templates only change the tokens and CSS.
import { computed, onMounted, reactive, ref } from 'vue'
import { translate, type Locale, type MessageKey } from '../i18n'
import { todayLine, weekdayIn, weekRows } from '../hours'
import { srcset } from '../images'
import { instagramLink, whatsappLink } from '../links'
import { isTemplate, pageStyle } from '../templates'
import type { PublicItem, PublicMenu } from '../types'
import MenuItem from './MenuItem.vue'

const props = withDefaults(
  defineProps<{ menu: PublicMenu; locale: Locale; landingUrl: string; now?: Date; preview?: boolean }>(),
  { now: () => new Date(), preview: false },
)

const t = (key: MessageKey, params: Record<string, string> = {}) => translate(props.locale, key, params)
const shop = computed(() => props.menu.shop)
const template = computed(() => (isTemplate(shop.value.template) ? shop.value.template : 'papan'))
const style = computed(() => pageStyle(template.value, shop.value.accent_color))

const today = computed(() => todayLine(shop.value.hours, shop.value.timezone, props.now, props.locale))
const todayWeekday = computed(() => weekdayIn(props.now, shop.value.timezone))
const week = computed(() => weekRows(shop.value.hours, props.locale))

const itemsById = computed(() => {
  const map = new Map<string, PublicItem>()
  for (const c of props.menu.categories) for (const i of c.items) map.set(i.id, i)
  return map
})
const recommended = computed(() =>
  props.menu.recommended.map((id) => itemsById.value.get(id)).filter((i): i is PublicItem => i !== undefined),
)

const priceNote = computed(() => {
  const note = shop.value.price_note
  if (!note) return null
  const parts = [note.tax_name, note.service_charge ? t('service_charge') : null].filter(
    (p): p is string => !!p,
  )
  return parts.length ? t('price_note', { parts: parts.join(` ${t('and')} `) }) : null
})

const hasContact = computed(
  () => !!(shop.value.address || shop.value.maps_url || shop.value.whatsapp || shop.value.instagram),
)

// Images that failed to load are left out, so a restored dump that points at
// deleted objects shows no image instead of a broken one (§12.7).
const broken = reactive(new Set<string>())
const root = ref<HTMLElement | null>(null)
onMounted(() => {
  root.value?.querySelectorAll<HTMLImageElement>('img[data-zm-img]').forEach((img) => {
    if (img.complete && img.naturalWidth === 0) broken.add(img.dataset['zmImg'] ?? '')
  })
})
const shows = (url: string | undefined) => !!url && !broken.has(url)

// Tabs scroll to their section inside whatever scrolls (the page, or the
// dashboard's phone frame) and never change the URL of the host page.
const scrollTo = (id: string) => {
  root.value?.querySelector(`#zm-c-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div ref="root" class="zm" :class="`zm--${template}`" :style="style" :lang="locale">
    <img
      v-if="shop.cover && shows(shop.cover.url_large)"
      class="zm-cover"
      :src="shop.cover.url_large"
      :srcset="srcset(shop.cover)"
      sizes="(min-width: 720px) 720px, 100vw"
      :width="shop.cover.width"
      :height="shop.cover.height"
      fetchpriority="high"
      alt=""
      :data-zm-img="shop.cover.url_large"
      @error="broken.add(shop.cover.url_large)"
    />

    <div class="zm-inner">
      <header class="zm-head" :class="{ 'zm-head--cover': shop.cover && shows(shop.cover.url_large) }">
        <img
          v-if="shop.logo && shows(shop.logo.url_small)"
          class="zm-logo"
          :src="shop.logo.url_small"
          :srcset="`${shop.logo.url_small} 1x, ${shop.logo.url_large} 4x`"
          width="72"
          height="72"
          alt=""
          :data-zm-img="shop.logo.url_small"
          @error="broken.add(shop.logo.url_small)"
        />
        <h1 class="zm-name">{{ shop.name }}</h1>
        <p v-if="shop.description" class="zm-desc">{{ shop.description }}</p>
      </header>

      <section v-if="today" class="zm-hours" :aria-label="t('hours')">
        <p class="zm-today" data-testid="menu-today">{{ today }}</p>
        <ul class="zm-week">
          <li
            v-for="row in week"
            :key="row.weekday"
            :class="{ 'zm-week-today': row.weekday === todayWeekday, 'zm-week-closed': !row.open }"
          >
            <span>{{ row.day }}</span><span>{{ row.range }}</span>
          </li>
        </ul>
      </section>

      <section v-if="hasContact" class="zm-contact">
        <p v-if="shop.address" class="zm-address">{{ shop.address }}</p>
        <p class="zm-buttons">
          <a
            v-if="shop.maps_url"
            class="zm-button"
            :href="shop.maps_url"
            target="_blank"
            rel="noopener noreferrer"
            >{{ t('open_map') }}</a
          >
          <a
            v-if="shop.whatsapp"
            class="zm-button"
            :href="whatsappLink(shop.whatsapp)"
            target="_blank"
            rel="noopener noreferrer"
            >{{ t('whatsapp') }}</a
          >
          <a
            v-if="shop.instagram"
            class="zm-button zm-button--quiet"
            :href="instagramLink(shop.instagram)"
            target="_blank"
            rel="noopener noreferrer"
            >{{ t('instagram') }}</a
          >
        </p>
      </section>

      <section v-if="recommended.length" class="zm-rec" data-testid="menu-recommended">
        <h2 class="zm-h2">{{ t('recommended') }}</h2>
        <ul class="zm-rec-list">
          <li v-for="item in recommended" :key="item.id">
            <MenuItem :item="item" :locale="locale" :badge="false" />
          </li>
        </ul>
      </section>

      <nav v-if="menu.categories.length > 1" class="zm-tabs" :aria-label="t('categories')">
        <a
          v-for="c in menu.categories"
          :key="c.id"
          class="zm-tab"
          :href="`#zm-c-${c.id}`"
          @click.prevent="scrollTo(c.id)"
          >{{ c.name }}</a
        >
      </nav>

      <section
        v-for="c in menu.categories"
        :id="`zm-c-${c.id}`"
        :key="c.id"
        class="zm-cat"
        data-testid="menu-category"
      >
        <h2 class="zm-h2">{{ c.name }}</h2>
        <ul class="zm-items">
          <li v-for="item in c.items" :key="item.id" data-testid="menu-item">
            <MenuItem :item="item" :locale="locale" :badge="true" />
          </li>
        </ul>
      </section>

      <section v-if="menu.gallery.length" class="zm-gallery">
        <h2 class="zm-h2">{{ t('gallery') }}</h2>
        <ul>
          <template v-for="g in menu.gallery" :key="g.url_large">
            <li v-if="shows(g.url_small)">
              <img
                :src="g.url_small"
                :srcset="srcset(g)"
                sizes="(min-width: 720px) 240px, 50vw"
                :width="g.width"
                :height="g.height"
                loading="lazy"
                decoding="async"
                alt=""
                :data-zm-img="g.url_small"
                @error="broken.add(g.url_small)"
              />
            </li>
          </template>
        </ul>
      </section>

      <p v-if="priceNote" class="zm-note" data-testid="menu-price-note">{{ priceNote }}</p>

      <footer class="zm-foot">
        <a :href="landingUrl" :target="preview ? '_blank' : undefined" rel="noopener">{{ t('footer') }}</a>
      </footer>
    </div>
  </div>
</template>

<style>
/* Everything is under .zm, with its own small reset, so the page looks the same
   in apps/menu and inside the dashboard (which has Tailwind's preflight). */
.zm {
  background: var(--zm-bg);
  color: var(--zm-text);
  font-family: var(--zm-font);
  font-size: 16px;
  line-height: 1.45;
  min-height: 100%;
  -webkit-text-size-adjust: 100%;
  text-align: left;
}
.zm *,
.zm *::before,
.zm *::after {
  box-sizing: border-box;
}
.zm :where(h1, h2, h3, p, ul, li, figure) {
  margin: 0;
  padding: 0;
}
.zm :where(ul) {
  list-style: none;
}
.zm img {
  display: block;
  max-width: 100%;
  height: auto;
}
.zm a {
  color: var(--zm-accent-text);
}
.zm-inner {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 16px 24px;
}
.zm-cover {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  aspect-ratio: 16 / 7;
  object-fit: cover;
}
.zm-head {
  padding-top: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
}
.zm-head--cover {
  padding-top: 0;
}
.zm-head--cover .zm-logo {
  margin-top: -36px;
}
.zm-logo {
  width: 72px;
  height: 72px;
  border-radius: 999px;
  object-fit: cover;
  border: 3px solid var(--zm-bg);
  background: var(--zm-surface);
}
.zm-head--cover:not(:has(.zm-logo)) {
  padding-top: 20px;
}
.zm-name {
  font-family: var(--zm-heading-font);
  font-size: 1.65rem;
  line-height: 1.2;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.zm-desc {
  color: var(--zm-muted);
  max-width: 34em;
}
.zm-hours {
  margin-top: 18px;
  text-align: center;
}
.zm-today {
  font-weight: 700;
  color: var(--zm-accent-text);
}
.zm-week {
  display: grid;
  grid-template-columns: auto auto;
  justify-content: center;
  column-gap: 16px;
  margin-top: 6px;
  font-size: 0.875rem;
  color: var(--zm-muted);
}
.zm-week li {
  display: contents;
}
.zm-week span:last-child {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.zm-week-today {
  color: var(--zm-text);
  font-weight: 600;
}
.zm-contact {
  margin-top: 18px;
  text-align: center;
}
.zm-address {
  color: var(--zm-muted);
  font-size: 0.9375rem;
}
.zm-buttons {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.zm a.zm-button {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--zm-accent);
  color: var(--zm-on-accent);
  font-weight: 600;
  font-size: 0.9375rem;
  text-decoration: none;
}
.zm a.zm-button--quiet {
  background: transparent;
  color: var(--zm-accent-text);
  box-shadow: inset 0 0 0 1.5px var(--zm-accent-text);
}
.zm-h2 {
  font-family: var(--zm-heading-font);
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 10px;
}
.zm-rec {
  margin-top: 28px;
}
.zm-rec-list {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 6px;
  scroll-snap-type: x proximity;
}
.zm-rec-list > li {
  flex: 0 0 min(46%, 200px);
  scroll-snap-align: start;
}
.zm-tabs {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin: 24px -16px 0;
  padding: 10px 16px;
  background: var(--zm-bg);
  border-bottom: 1px solid var(--zm-line);
  scrollbar-width: none;
}
.zm a.zm-tab {
  flex: 0 0 auto;
  padding: 6px 12px;
  border-radius: 999px;
  color: var(--zm-text);
  text-decoration: none;
  font-size: 0.9375rem;
  box-shadow: inset 0 0 0 1px var(--zm-line);
  white-space: nowrap;
}
.zm-cat {
  margin-top: 24px;
  scroll-margin-top: 64px;
}
.zm-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Item */
.zm-item {
  display: flex;
  gap: 12px;
  align-items: center;
  height: 100%;
}
.zm-item-photo {
  width: 64px;
  height: 64px;
  object-fit: cover;
  flex: 0 0 auto;
  border-radius: calc(var(--zm-radius) / 2);
}
.zm-item-body {
  flex: 1;
  min-width: 0;
}
.zm-item-name {
  font-size: 1rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.zm-item-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
.zm-price {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.zm-leader {
  display: none;
}
.zm-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.zm-badge--rec {
  background: var(--zm-accent);
  color: var(--zm-on-accent);
}
.zm-badge--out {
  color: var(--zm-text);
  box-shadow: inset 0 0 0 1px var(--zm-muted);
}
.zm-item--out .zm-item-name,
.zm-item--out .zm-price,
.zm-item--out .zm-item-photo {
  opacity: 0.55;
}
.zm-item--out .zm-price {
  text-decoration: line-through;
}

.zm-gallery {
  margin-top: 28px;
}
.zm-gallery ul {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.zm-gallery img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: calc(var(--zm-radius) / 2);
}
.zm-note {
  margin-top: 24px;
  font-size: 0.875rem;
  color: var(--zm-muted);
  text-align: center;
}
.zm-foot {
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px solid var(--zm-line);
  text-align: center;
  font-size: 0.8125rem;
}

/* Foto: photo-led cards in a grid. */
.zm--foto .zm-items {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.zm--foto .zm-item {
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  background: var(--zm-surface);
  border-radius: var(--zm-radius);
  overflow: hidden;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}
.zm--foto .zm-item-photo {
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
  border-radius: 0;
}
.zm--foto .zm-item-body {
  padding: 10px 12px 12px;
}
.zm--foto .zm-cover {
  aspect-ratio: 16 / 9;
}
.zm--foto .zm-gallery ul {
  grid-template-columns: repeat(3, 1fr);
}

/* Papan: a clean text list like a menu board. */
.zm--papan .zm-h2 {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 1.05rem;
  padding-bottom: 6px;
  border-bottom: 2px solid var(--zm-text);
}
.zm--papan .zm-items {
  gap: 0;
}
.zm--papan .zm-items > li {
  padding: 10px 0;
  border-bottom: 1px dashed var(--zm-line);
}
.zm--papan .zm-item-body {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.zm--papan .zm-leader {
  display: block;
  flex: 1;
  min-width: 12px;
  border-bottom: 2px dotted var(--zm-line);
  transform: translateY(-4px);
}
.zm--papan .zm-item-meta {
  flex-wrap: nowrap;
  margin-top: 0;
}
.zm--papan .zm-item-photo {
  width: 52px;
  height: 52px;
}
.zm--papan .zm-rec-list .zm-item-body {
  display: block;
}
.zm--papan .zm-rec-list .zm-leader {
  display: none;
}
.zm--papan .zm-rec-list .zm-item-meta {
  flex-wrap: wrap;
}
.zm--papan a.zm-button,
.zm--papan a.zm-tab,
.zm--papan .zm-badge {
  border-radius: 4px;
}

/* Hangat: soft, rounded, warm. */
.zm--hangat .zm-items > li .zm-item,
.zm--hangat .zm-rec-list .zm-item {
  background: var(--zm-surface);
  border-radius: var(--zm-radius);
  padding: 10px;
  box-shadow: 0 2px 8px rgb(120 72 30 / 0.08);
}
.zm--hangat .zm-cover {
  border-radius: 0 0 28px 28px;
}
.zm--hangat .zm-item-photo {
  border-radius: 14px;
}
.zm--hangat .zm-gallery img {
  border-radius: 18px;
}

/* Recommended cards are vertical in every template. */
.zm-rec-list .zm-item {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.zm-rec-list .zm-item-photo {
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
}

@media (min-width: 560px) {
  .zm--foto .zm-items {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .zm-gallery ul {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .zm * {
    scroll-behavior: auto !important;
  }
}
</style>
