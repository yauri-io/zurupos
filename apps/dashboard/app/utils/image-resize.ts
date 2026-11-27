// Phone photos are often 3–6 MB, over the API's 2 MB limit (D-079). Before
// uploading, the dashboard shrinks them to at most 2000 px on the long side as
// JPEG quality 0.85. The server still decodes and re-encodes every upload.
import { fitWithin } from './online-menu'

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
const MAX_SIDE = 2000
const JPEG_QUALITY = 0.85

const keepsTransparency = (type: string) => type === 'image/png' || type === 'image/webp'

export const downsizeForUpload = async (file: File): Promise<Blob> => {
  let bitmap: ImageBitmap
  try {
    // Browsers apply the EXIF orientation when decoding (image-orientation: from-image).
    bitmap = await createImageBitmap(file)
  } catch {
    // The browser can't read it: send it as it is and let the server answer.
    return file
  }
  try {
    const small = Math.max(bitmap.width, bitmap.height) <= MAX_SIDE
    // A small PNG or WebP (a logo, say) goes as it is, so transparency survives.
    if (small && file.size <= MAX_UPLOAD_BYTES && keepsTransparency(file.type)) return file
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_SIDE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // JPEG has no transparency: paint white first instead of black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    return blob ?? file
  } finally {
    bitmap.close()
  }
}
