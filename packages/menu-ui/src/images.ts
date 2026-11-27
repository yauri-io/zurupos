// srcset for our variants. URLs end in -<long side>.webp (SPEC §12.7), and the
// payload has the large variant's size, so the small one's width follows.
import type { PublicImg } from './types'

const labelOf = (url: string): number | null => {
  const m = /-(\d+)\.webp$/.exec(url)
  return m?.[1] ? Number(m[1]) : null
}

export const srcset = (img: PublicImg): string => {
  const small = labelOf(img.url_small)
  if (small === null) return `${img.url_large} ${img.width}w`
  const scale = Math.min(1, small / Math.max(img.width, img.height))
  const smallWidth = Math.round(img.width * scale)
  return smallWidth >= img.width
    ? `${img.url_large} ${img.width}w`
    : `${img.url_small} ${smallWidth}w, ${img.url_large} ${img.width}w`
}
