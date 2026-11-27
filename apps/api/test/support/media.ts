// Media helpers for online-menu tests: a local store that records every put and
// delete, and multipart uploads through the real routes.
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { App } from '../../src/http/types.js'
import { createLocalStore } from '../../src/media/local-store.js'
import type { MediaStore } from '../../src/media/store.js'
import { TEST_MEDIA_DIR } from '../helpers.js'
import { APP_HEADERS, headersFor, type Creds } from './app.js'
import { multipart } from './images.js'

export type RecordingStore = MediaStore & { puts: string[]; deletes: string[] }

// Writes into TEST_MEDIA_DIR (which the app serves under /media), like the real
// local driver. Keys are random, so parallel test files never collide.
export const recordingStore = (
  opts: { failPut?: () => boolean; failDelete?: () => boolean } = {},
): RecordingStore => {
  const inner = createLocalStore({ dir: TEST_MEDIA_DIR, publicBaseUrl: 'http://localhost:4000/media' })
  const puts: string[] = []
  const deletes: string[] = []
  return {
    puts,
    deletes,
    url: inner.url,
    put: async (key, body) => {
      if (opts.failPut?.()) throw new Error('injected put failure')
      puts.push(key)
      await inner.put(key, body)
    },
    delete: async (key) => {
      if (opts.failDelete?.()) throw new Error('injected delete failure')
      deletes.push(key)
      await inner.delete(key)
    },
  }
}

export const objectExists = async (key: string): Promise<boolean> => {
  try {
    await stat(join(TEST_MEDIA_DIR, key))
    return true
  } catch {
    return false
  }
}

// `http://localhost:4000/media/m/<key>-<size>.webp` → `m/<key>-<size>.webp`
export const keyOfUrl = (url: string): string => {
  const match = /\/(m\/[0-9a-f]{32}-[0-9]+\.webp)$/.exec(url)
  if (!match?.[1]) throw new Error(`not a media URL: ${url}`)
  return match[1]
}

export const upload = (
  app: App,
  creds: Creds,
  method: 'PUT' | 'POST',
  url: string,
  file: Buffer,
  opts: Parameters<typeof multipart>[1] = {},
) => {
  const form = multipart(file, opts)
  return app.inject({
    method,
    url,
    headers: { ...APP_HEADERS, ...headersFor(creds), ...form.headers },
    payload: form.payload,
  })
}
