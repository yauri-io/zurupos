// SPEC §12.7, D-079: decode check, EXIF rotation, no metadata kept, WebP
// variants per purpose, never upscaled.
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { processImage } from '../../src/media/pipeline.js'
import { VARIANT_SIZES } from '../../src/media/variants.js'
import { CAMERA_MARKER, GPS_MARKER, notAnImage, phonePhoto, pixelAt, solidImage } from '../support/images.js'

const reasonOf = async (run: Promise<unknown>) => {
  try {
    await run
    return 'accepted'
  } catch (err) {
    return (err as { code?: string; details?: { reason?: string } }).details?.reason ?? 'thrown'
  }
}

describe('image pipeline', () => {
  it('the test photo really carries orientation, GPS and camera tags', async () => {
    const photo = await phonePhoto()
    const meta = await sharp(photo).metadata()
    expect({ w: meta.width, h: meta.height, orientation: meta.orientation, exif: !!meta.exif }).toEqual({
      w: 200,
      h: 100,
      orientation: 6,
      exif: true,
    })
    expect(photo.includes(GPS_MARKER)).toBe(true)
    expect(photo.includes(CAMERA_MARKER)).toBe(true)
  })

  it('applies EXIF orientation and keeps no metadata in any variant', async () => {
    const out = await processImage(await phonePhoto(), 'item')
    expect(out.variants).toHaveLength(2)
    for (const v of out.variants) {
      const meta = await sharp(v.data).metadata()
      expect(meta.format).toBe('webp')
      // Rotated: 200×100 stored, 100×200 shown.
      expect({ w: meta.width, h: meta.height }).toEqual({ w: 100, h: 200 })
      expect({
        exif: meta.exif,
        xmp: meta.xmp,
        icc: meta.icc,
        iptc: meta.iptc,
        orientation: meta.orientation,
      }).toEqual({
        exif: undefined,
        xmp: undefined,
        icc: undefined,
        iptc: undefined,
        orientation: undefined,
      })
      expect(v.data.includes(GPS_MARKER)).toBe(false)
      expect(v.data.includes(CAMERA_MARKER)).toBe(false)
      expect(v.data.includes('Exif')).toBe(false)
      // The left (red) half of the stored image is now on top.
      expect((await pixelAt(v.data, 50, 20)).r).toBeGreaterThan(150)
      expect((await pixelAt(v.data, 50, 180)).b).toBeGreaterThan(150)
    }
  })

  it.each(Object.entries(VARIANT_SIZES))(
    '%s: variants fit the long side and are WebP',
    async (purpose, sizes) => {
      const out = await processImage(await solidImage(3000, 2000), purpose as keyof typeof VARIANT_SIZES)
      expect(out.variants.map((v) => [v.size, v.width, v.height])).toEqual(
        sizes.map((s) => [s, s, Math.round((s * 2) / 3)]),
      )
      expect({ width: out.width, height: out.height }).toEqual({
        width: sizes[1],
        height: Math.round((sizes[1] * 2) / 3),
      })
    },
  )

  it('never upscales a small image', async () => {
    const out = await processImage(await solidImage(300, 200), 'cover')
    expect(out.variants.map((v) => [v.size, v.width, v.height])).toEqual([
      [800, 300, 200],
      [1600, 300, 200],
    ])
    expect({ width: out.width, height: out.height }).toEqual({ width: 300, height: 200 })
  })

  it('fits portrait images by height', async () => {
    const out = await processImage(await solidImage(1000, 2000), 'logo')
    expect(out.variants.map((v) => [v.width, v.height])).toEqual([
      [64, 128],
      [256, 512],
    ])
  })

  it.each(['jpeg', 'png', 'webp'] as const)('accepts %s', async (format) => {
    const input = await solidImage(640, 480, format)
    const out = await processImage(input, 'gallery')
    expect(out.bytes).toBe(input.length)
  })

  it.each(['gif', 'tiff'] as const)('rejects %s', async (format) => {
    expect(await reasonOf(processImage(await solidImage(64, 64, format), 'item'))).toBe('not_an_image')
  })

  it('rejects a renamed text file, an empty file and SVG', async () => {
    expect(await reasonOf(processImage(notAnImage(), 'item'))).toBe('not_an_image')
    expect(await reasonOf(processImage(Buffer.alloc(0), 'item'))).toBe('not_an_image')
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')
    expect(await reasonOf(processImage(svg, 'item'))).toBe('not_an_image')
  })

  it('rejects a truncated JPEG', async () => {
    const jpeg = await solidImage(800, 600)
    expect(await reasonOf(processImage(jpeg.subarray(0, Math.floor(jpeg.length / 2)), 'item'))).toBe(
      'not_an_image',
    )
  })

  it('rejects images over 40 megapixels before decoding them', async () => {
    // 8000×6000 = 48 MP of one colour compresses to a few kB of PNG.
    const big = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: '#fff' } })
      .png({ compressionLevel: 9 })
      .toBuffer()
    expect(big.length).toBeLessThan(2 * 1024 * 1024)
    expect(await reasonOf(processImage(big, 'item'))).toBe('too_many_pixels')
  })
})
