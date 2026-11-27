// The image pipeline (SPEC §12.7, D-079). Every upload is decoded and re-encoded
// here; nothing is stored as sent. The declared content type and file name are
// ignored: only the bytes decide.
import sharp, { type Metadata } from 'sharp'
import { apiError } from '../http/errors.js'
import { VARIANT_SIZES, type MediaPurpose } from './variants.js'

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
export const MAX_INPUT_PIXELS = 40_000_000
const WEBP_QUALITY = 80
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp'])

export type Variant = { size: number; data: Buffer; width: number; height: number }
export type ProcessedImage = {
  variants: Variant[]
  // Of the largest variant.
  width: number
  height: number
  // Of the upload.
  bytes: number
}

const notAnImage = () => apiError('VALIDATION', { field: 'file', reason: 'not_an_image' })

// Cheap signature check before any decoder sees the bytes, so formats we never
// accept (SVG, GIF, TIFF, HEIC, PDF …) don't reach libvips at all.
const looksLikeAcceptedImage = (buf: Buffer): boolean => {
  const jpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  const png =
    buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const webp =
    buf.length > 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  return jpeg || png || webp
}

// First frame only, bounded pixel count, and decode warnings (truncated data)
// count as failures.
const open = (input: Buffer) =>
  sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, pages: 1, failOn: 'warning' })

export const processImage = async (input: Buffer, purpose: MediaPurpose): Promise<ProcessedImage> => {
  if (input.length === 0 || !looksLikeAcceptedImage(input)) throw notAnImage()
  let meta: Metadata
  try {
    // Header only (no pixel decode), so the size check below can name the problem.
    meta = await sharp(input, { pages: 1 }).metadata()
  } catch {
    throw notAnImage()
  }
  if (!ACCEPTED_FORMATS.has(meta.format)) throw notAnImage()
  if (meta.width * (meta.pageHeight ?? meta.height) > MAX_INPUT_PIXELS) {
    throw apiError('VALIDATION', { field: 'file', reason: 'too_many_pixels' })
  }

  // rotate() with no angle applies the EXIF orientation; sharp writes no
  // metadata (EXIF, GPS, XMP, ICC) unless asked to, and we never ask.
  const base = open(input).rotate()
  const variants: Variant[] = []
  try {
    for (const size of VARIANT_SIZES[purpose]) {
      const { data, info } = await base
        .clone()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true })
      variants.push({ size, data, width: info.width, height: info.height })
    }
  } catch {
    throw notAnImage()
  }
  const largest = variants[variants.length - 1]
  if (!largest) throw notAnImage()
  return { variants, width: largest.width, height: largest.height, bytes: input.length }
}
