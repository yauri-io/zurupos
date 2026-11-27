// Page text in Bahasa Indonesia, or English when the visitor's first preferred
// language is English (SPEC §12.7). A small dictionary: the page has few strings.
export type Locale = 'id' | 'en'

const MESSAGES = {
  id: {
    today: 'Hari ini {range}',
    closed_today: 'Hari ini tutup',
    hours: 'Jam buka',
    closed: 'Tutup',
    open_map: 'Buka peta',
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
    recommended: 'Rekomendasi',
    sold_out: 'Habis',
    gallery: 'Galeri',
    categories: 'Kategori menu',
    price_note: 'Harga belum termasuk {parts}.',
    and: 'dan',
    service_charge: 'biaya layanan',
    footer: 'Menu oleh ZuruPOS',
    title: '{name} — Menu dan harga',
    description: 'Menu dan harga {name}: {categories}.',
    not_found: 'Menu tidak ditemukan',
    not_found_text: 'Alamat menu ini tidak ada atau sedang tidak ditampilkan.',
    to_landing: 'Ke ZuruPOS',
    error: 'Menu sedang tidak bisa dibuka',
    error_text: 'Coba lagi sebentar lagi.',
    weekday_1: 'Senin',
    weekday_2: 'Selasa',
    weekday_3: 'Rabu',
    weekday_4: 'Kamis',
    weekday_5: 'Jumat',
    weekday_6: 'Sabtu',
    weekday_7: 'Minggu',
  },
  en: {
    today: 'Today {range}',
    closed_today: 'Closed today',
    hours: 'Opening hours',
    closed: 'Closed',
    open_map: 'Open map',
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
    recommended: 'Recommended',
    sold_out: 'Sold out',
    gallery: 'Gallery',
    categories: 'Menu categories',
    price_note: 'Prices exclude {parts}.',
    and: 'and',
    service_charge: 'service charge',
    footer: 'Menu by ZuruPOS',
    title: '{name} — Menu and prices',
    description: '{name} menu and prices: {categories}.',
    not_found: 'Menu not found',
    not_found_text: "This menu address doesn't exist or isn't shown right now.",
    to_landing: 'Go to ZuruPOS',
    error: "The menu can't be opened right now",
    error_text: 'Please try again in a moment.',
    weekday_1: 'Monday',
    weekday_2: 'Tuesday',
    weekday_3: 'Wednesday',
    weekday_4: 'Thursday',
    weekday_5: 'Friday',
    weekday_6: 'Saturday',
    weekday_7: 'Sunday',
  },
} as const

export type MessageKey = keyof (typeof MESSAGES)['id']

export const translate = (locale: Locale, key: MessageKey, params: Record<string, string> = {}): string =>
  MESSAGES[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? `{${name}}`)

// From an Accept-Language header or navigator.languages: English only when the
// first preferred language is English, Indonesian otherwise.
export const pickLocale = (preferred: string | readonly string[] | null | undefined): Locale => {
  const first = (typeof preferred === 'string' ? preferred.split(',')[0] : preferred?.[0]) ?? ''
  return first.trim().toLowerCase().startsWith('en') ? 'en' : 'id'
}
