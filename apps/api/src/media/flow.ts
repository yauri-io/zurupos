// Order of work for an image change (SPEC §12.7): process → put objects →
// database transaction → after commit, delete the replaced objects. If the
// transaction fails, the new objects are deleted instead. A failed delete only
// leaves an orphan object, logged at warn.
import { randomBytes } from 'node:crypto'
import type { FastifyBaseLogger } from 'fastify'
import { processImage } from './pipeline.js'
import type { MediaStore } from './store.js'
import { variantKeys, type MediaPurpose } from './variants.js'
import { objectKey } from './store.js'

export type NewMedia = {
  purpose: MediaPurpose
  storage_key: string
  width: number
  height: number
  bytes: number
}

// A media row that a change replaced or removed; its objects go after commit.
export type ReplacedMedia = { storage_key: string; purpose: MediaPurpose }

export const removeObjects = async (
  store: MediaStore,
  log: FastifyBaseLogger,
  media: readonly ReplacedMedia[],
): Promise<void> => {
  const keys = media.flatMap((m) => variantKeys(m.storage_key, m.purpose))
  const results = await Promise.allSettled(keys.map((key) => store.delete(key)))
  results.forEach((r, i) => {
    if (r.status === 'rejected') log.warn({ key: keys[i], err: r.reason }, 'media: orphan object left behind')
  })
}

// Processes the upload and writes its variants. Nothing touches the database here.
export const storeUpload = async (
  store: MediaStore,
  log: FastifyBaseLogger,
  upload: Buffer,
  purpose: MediaPurpose,
): Promise<NewMedia> => {
  const image = await processImage(upload, purpose)
  const storageKey = randomBytes(16).toString('hex')
  const results = await Promise.allSettled(
    image.variants.map((v) => store.put(objectKey(storageKey, v.size), v.data)),
  )
  const failed = results.find((r) => r.status === 'rejected')
  if (failed) {
    await removeObjects(store, log, [{ storage_key: storageKey, purpose }])
    throw failed.reason
  }
  return { purpose, storage_key: storageKey, width: image.width, height: image.height, bytes: image.bytes }
}

// Runs the database change for objects that already exist. `change` returns its
// result and the media rows it replaced.
export const commitMediaChange = async <T>(
  store: MediaStore,
  log: FastifyBaseLogger,
  created: readonly ReplacedMedia[],
  change: () => Promise<{ result: T; replaced: readonly ReplacedMedia[] }>,
): Promise<T> => {
  let outcome: { result: T; replaced: readonly ReplacedMedia[] }
  try {
    outcome = await change()
  } catch (err) {
    await removeObjects(store, log, created)
    throw err
  }
  await removeObjects(store, log, outcome.replaced)
  return outcome.result
}
