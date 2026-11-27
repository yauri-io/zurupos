// WebP variants per purpose (SPEC §12.7): long side in px, small first.
import { objectKey, type MediaStore } from './store.js'

export const MEDIA_PURPOSES = ['item', 'logo', 'cover', 'gallery'] as const
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number]

export const VARIANT_SIZES: Record<MediaPurpose, readonly [small: number, large: number]> = {
  item: [480, 1200],
  gallery: [480, 1200],
  cover: [800, 1600],
  logo: [128, 512],
}

export const variantKeys = (storageKey: string, purpose: MediaPurpose): string[] =>
  VARIANT_SIZES[purpose].map((size) => objectKey(storageKey, size))

// Img in API responses (§12.7): both URLs plus the large variant's size, so pages
// can set width and height and avoid layout shift.
export type Img = { url_small: string; url_large: string; width: number; height: number }

export type MediaRef = { storage_key: string; purpose: MediaPurpose; width: number; height: number }

export const presentImg = (store: MediaStore, media: MediaRef | null): Img | null => {
  if (!media) return null
  const [small, large] = VARIANT_SIZES[media.purpose]
  return {
    url_small: store.url(objectKey(media.storage_key, small)),
    url_large: store.url(objectKey(media.storage_key, large)),
    width: media.width,
    height: media.height,
  }
}

export const isMediaPurpose = (value: string): value is MediaPurpose =>
  (MEDIA_PURPOSES as readonly string[]).includes(value)
