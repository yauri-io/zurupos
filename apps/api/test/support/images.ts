// Test images made with sharp, so no binary fixtures live in the repo.
import sharp from 'sharp'

export const GPS_MARKER = 'ZZGPSDATUM'
export const CAMERA_MARKER = 'ZZCAMERA'

const RED = { r: 220, g: 30, b: 30 }
const BLUE = { r: 30, g: 30, b: 220 }

// A plain image of the given size and format.
export const solidImage = (
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp' | 'gif' | 'tiff' = 'jpeg',
): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: RED } })
    .toFormat(format)
    .toBuffer()

// A 200×100 JPEG: left half red, right half blue, stored with EXIF orientation 6
// (display rotated 90° clockwise) and GPS + camera tags, like a phone photo.
// Shown correctly it is 100×200 with red on top and blue at the bottom.
export const phonePhoto = async (): Promise<Buffer> => {
  const left = await sharp({ create: { width: 100, height: 100, channels: 3, background: RED } })
    .png()
    .toBuffer()
  return sharp({ create: { width: 200, height: 100, channels: 3, background: BLUE } })
    .composite([{ input: left, left: 0, top: 0 }])
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: CAMERA_MARKER, Model: CAMERA_MARKER },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 12/1 0/1', GPSMapDatum: GPS_MARKER },
    })
    .toBuffer()
}

// Pixel colour at (x, y) of an encoded image.
export const pixelAt = async (image: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true })
  const i = (y * info.width + x) * info.channels
  return { r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 }
}

// Bytes of random data that are not an image, e.g. a text file renamed to .jpg.
export const notAnImage = (size = 2048): Buffer =>
  Buffer.from('This is a text file renamed to photo.jpg\n'.repeat(Math.ceil(size / 41))).subarray(0, size)

// A multipart/form-data body with one file part, for app.inject().
export const multipart = (
  file: Buffer,
  opts: { field?: string; filename?: string; contentType?: string } = {},
): { payload: Buffer; headers: Record<string, string> } => {
  const boundary = `----zurutest${Math.random().toString(16).slice(2)}`
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${opts.field ?? 'file'}"; filename="${opts.filename ?? 'photo.jpg'}"\r\n` +
      `Content-Type: ${opts.contentType ?? 'image/jpeg'}\r\n\r\n`,
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return {
    payload: Buffer.concat([head, file, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}
