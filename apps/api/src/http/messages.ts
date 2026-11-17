import type { ErrorCode } from './errors.js'

export type Locale = 'id' | 'en'

const MESSAGES: Record<ErrorCode, Record<Locale, string>> = {
  VALIDATION: { id: 'Data tidak valid.', en: 'Invalid request data.' },
  UNAUTHENTICATED: { id: 'Silakan masuk terlebih dahulu.', en: 'Please sign in first.' },
  FORBIDDEN: { id: 'Anda tidak memiliki akses.', en: 'You do not have permission.' },
  NOT_FOUND: { id: 'Data tidak ditemukan.', en: 'Not found.' },
  CONFLICT: { id: 'Data sudah ada atau bentrok.', en: 'Conflicts with existing data.' },
  PIN_LOCKED: { id: 'PIN terkunci sementara. Coba lagi nanti.', en: 'PIN temporarily locked. Try again later.' },
  PAYMENT_MISMATCH: { id: 'Jumlah pembayaran tidak sesuai total.', en: 'Payments do not match the total.' },
  PRICE_CHANGED: { id: 'Harga telah berubah. Periksa total baru.', en: 'Prices changed. Check the new total.' },
  ITEM_UNAVAILABLE: { id: 'Item tidak tersedia.', en: 'Item is unavailable.' },
  RATE_LIMITED: { id: 'Terlalu banyak percobaan. Coba lagi nanti.', en: 'Too many attempts. Try again later.' },
  INTERNAL: { id: 'Terjadi kesalahan pada server.', en: 'Something went wrong on the server.' },
}

export const localeFromHeader = (header: string | undefined): Locale =>
  header?.trim().toLowerCase().startsWith('en') ? 'en' : 'id'

export const errorMessage = (code: ErrorCode, locale: Locale): string => MESSAGES[code][locale]
