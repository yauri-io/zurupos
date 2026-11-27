<script setup lang="ts">
// Printable A6 QR card for the counter or the window (SPEC §12.7, D-080).
// Opened in its own tab from /online-menu; the browser's print dialog saves it
// as PDF or prints it. The QR is drawn here, never on the server.
definePageMeta({ permission: 'online_menu.manage', layout: false })
const { t } = useI18n()
const api = useApi()
// A6 page size only while this page is open, so other pages print normally.
useHead({
  title: () => t('online_menu.card_title'),
  style: [{ key: 'a6-page', innerHTML: '@page { size: A6 portrait; margin: 0; }' }],
})
const printCard = () => window.print()

const menu = await unwrap(api.GET('/v1/online-menu'))
const qr = menu.qr_url ? await qrDataUrl(menu.qr_url) : null
const shortUrl = menu.public_url?.replace(/^https?:\/\//, '') ?? ''
</script>

<template>
  <div class="min-h-screen bg-white text-black print:min-h-0">
    <div class="print:hidden flex flex-wrap items-center gap-3 p-4 border-b border-gray-200">
      <UButton
        icon="i-lucide-printer"
        :label="t('online_menu.print')"
        :disabled="!qr"
        data-testid="print"
        @click="printCard"
      />
      <UButton
        to="/online-menu"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        :label="t('nav.online_menu')"
      />
      <p class="text-sm text-gray-600">{{ t('online_menu.print_help') }}</p>
    </div>

    <p v-if="!qr" class="p-6 text-gray-700">{{ t('online_menu.card_no_slug') }}</p>

    <!-- 105 × 148 mm -->
    <article
      v-else
      class="a6 mx-auto my-6 print:my-0 flex flex-col items-center justify-between text-center"
      data-testid="a6-card"
    >
      <header class="flex flex-col items-center gap-[3mm]">
        <img
          v-if="menu.logo"
          :src="menu.logo.url_small"
          alt=""
          class="size-[16mm] rounded-full object-cover"
        />
        <h1 class="text-[7mm] leading-tight font-bold break-words">{{ menu.name }}</h1>
        <p class="text-[4.2mm] leading-snug">{{ t('online_menu.card_headline') }}</p>
      </header>
      <img :src="qr" :alt="t('online_menu.qr_alt')" class="size-[68mm]" />
      <footer class="flex flex-col items-center gap-[1.5mm]">
        <p class="text-[3.6mm] font-medium break-all">{{ shortUrl }}</p>
        <p class="text-[2.8mm] text-gray-600">{{ t('online_menu.card_footer') }}</p>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.a6 {
  width: 105mm;
  height: 148mm;
  padding: 10mm 8mm;
  box-sizing: border-box;
  border: 0.3mm dashed #bbb;
}
@media print {
  .a6 {
    border: none;
  }
}
</style>
