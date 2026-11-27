// Media storage behind one interface (SPEC §2, §12.7, D-079): an S3-API bucket
// (Cloudflare R2) in production, a local folder served by the API in dev/test.
// Only processed WebP variants are ever stored; uploads are never kept as sent.

export type MediaStore = {
  // Writes one immutable object. Keys come from objectKey(), never from input.
  put: (key: string, body: Buffer) => Promise<void>
  // Removes an object; a missing object is not an error.
  delete: (key: string) => Promise<void>
  // The public URL of an object.
  url: (key: string) => string
}

export const MEDIA_CONTENT_TYPE = 'image/webp'
// Keys are content-addressed by a random storage key, so they never change.
export const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable'

// `m/<storage_key>-<size>.webp`; storage_key is 32 random hex characters.
export const OBJECT_KEY = /^m\/[0-9a-f]{32}-[0-9]{2,4}\.webp$/

export const objectKey = (storageKey: string, size: number): string => {
  const key = `m/${storageKey}-${size}.webp`
  if (!OBJECT_KEY.test(key)) throw new Error('objectKey: malformed storage key or size')
  return key
}

export const assertObjectKey = (key: string): void => {
  if (!OBJECT_KEY.test(key)) throw new Error('media store: refusing a malformed object key')
}
