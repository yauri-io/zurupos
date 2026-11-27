// MEDIA_DRIVER=local: variants go into a folder that the API serves under
// /media/* (media/serve.ts). For development and tests only.
import { randomBytes } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { assertObjectKey, type MediaStore } from './store.js'

export const localFilePath = (dir: string, key: string): string => {
  assertObjectKey(key)
  return join(resolve(dir), key)
}

export const createLocalStore = ({
  dir,
  publicBaseUrl,
}: {
  dir: string
  publicBaseUrl: string
}): MediaStore => ({
  put: async (key, body) => {
    const path = localFilePath(dir, key)
    await mkdir(dirname(path), { recursive: true })
    // Write then rename, so a reader never sees half a file.
    const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(tmp, body)
    await rename(tmp, path)
  },
  delete: async (key) => {
    await rm(localFilePath(dir, key), { force: true })
  },
  url: (key) => {
    assertObjectKey(key)
    return `${publicBaseUrl}/${key}`
  },
})
