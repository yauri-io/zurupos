// MediaStore drivers (SPEC §12.7). The S3 driver is checked against a local
// HTTP server standing in for R2: no request ever leaves the machine.
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadMedia } from '../../src/config/env.js'
import { createLocalStore } from '../../src/media/local-store.js'
import { createS3Store } from '../../src/media/s3-store.js'
import { objectKey } from '../../src/media/store.js'

const KEY = objectKey('0123456789abcdef0123456789abcdef', 480)

describe('local store', () => {
  let dir = ''
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'zuru-media-'))
  })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  it('writes, serves by URL and deletes', async () => {
    const store = createLocalStore({ dir, publicBaseUrl: 'http://localhost:4000/media' })
    await store.put(KEY, Buffer.from('webp-bytes'))
    expect(await readFile(join(dir, KEY), 'utf8')).toBe('webp-bytes')
    expect(store.url(KEY)).toBe(`http://localhost:4000/media/${KEY}`)
    await store.delete(KEY)
    await expect(stat(join(dir, KEY))).rejects.toThrow()
    // Deleting a missing object is fine.
    await store.delete(KEY)
  })

  it('refuses keys that are not ours (no path traversal)', async () => {
    const store = createLocalStore({ dir, publicBaseUrl: 'http://x' })
    for (const key of ['../etc/passwd', 'm/../../x.webp', 'm/ABC-480.webp', `${KEY}/../x`]) {
      await expect(store.put(key, Buffer.from('x')), key).rejects.toThrow(/malformed/)
    }
  })
})

type Seen = { method: string; url: string; headers: IncomingMessage['headers']; body: Buffer }

describe('s3 store', () => {
  let server: Server
  let endpoint = ''
  const seen: Seen[] = []
  let status = 200

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        seen.push({
          method: req.method ?? '',
          url: req.url ?? '',
          headers: req.headers,
          body: Buffer.concat(chunks),
        })
        res.statusCode = status
        res.end()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve()
      }),
    )
  })

  const store = () =>
    createS3Store({
      endpoint,
      bucket: 'zurupos-media',
      accessKeyId: 'test-key-id',
      secretAccessKey: 'test-secret',
      publicBaseUrl: 'https://media.zurupos.com',
    })

  it('PUTs a signed, immutable WebP object path-style', async () => {
    seen.length = 0
    status = 200
    await store().put(KEY, Buffer.from('webp-bytes'))
    const req = seen[0]
    expect(req?.method).toBe('PUT')
    expect(req?.url).toBe(`/zurupos-media/${KEY}`)
    expect(req?.body.toString()).toBe('webp-bytes')
    expect(req?.headers['content-type']).toBe('image/webp')
    expect(req?.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(req?.headers['authorization']).toMatch(
      /^AWS4-HMAC-SHA256 Credential=test-key-id\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=cache-control;host;/,
    )
    // The secret itself is never sent.
    expect(JSON.stringify(req?.headers)).not.toContain('test-secret')
  })

  it('DELETE tolerates a missing object, but not other failures', async () => {
    seen.length = 0
    status = 404
    await store().delete(KEY)
    expect(seen[0]?.method).toBe('DELETE')
    status = 500
    await expect(store().delete(KEY)).rejects.toThrow(/HTTP 500/)
    await expect(store().put(KEY, Buffer.from('x'))).rejects.toThrow(/HTTP 500/)
  })

  it('public URLs use the media domain, not the endpoint', () => {
    expect(store().url(KEY)).toBe(`https://media.zurupos.com/${KEY}`)
  })
})

describe('media config', () => {
  const base = { MEDIA_PUBLIC_BASE_URL: 'https://media.zurupos.com/' }

  it('defaults to the local driver, which needs a folder', () => {
    expect(() => loadMedia(base)).toThrow(/MEDIA_LOCAL_DIR/)
    expect(loadMedia({ ...base, MEDIA_LOCAL_DIR: '/data/media' })).toMatchObject({
      driver: 'local',
      localDir: '/data/media',
      publicBaseUrl: 'https://media.zurupos.com',
    })
  })

  it('s3 needs every MEDIA_S3_* variable', () => {
    const s3 = {
      ...base,
      MEDIA_DRIVER: 's3',
      MEDIA_S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
      MEDIA_S3_BUCKET: 'b',
      MEDIA_S3_ACCESS_KEY_ID: 'k',
      MEDIA_S3_SECRET_ACCESS_KEY: 's',
    }
    expect(loadMedia(s3).s3).toMatchObject({ bucket: 'b', endpoint: 'https://acc.r2.cloudflarestorage.com' })
    for (const key of [
      'MEDIA_S3_ENDPOINT',
      'MEDIA_S3_BUCKET',
      'MEDIA_S3_ACCESS_KEY_ID',
      'MEDIA_S3_SECRET_ACCESS_KEY',
    ]) {
      expect(() => loadMedia({ ...s3, [key]: '' }), key).toThrow(key)
    }
  })

  it('rejects a base URL that is not http(s)', () => {
    expect(() => loadMedia({ MEDIA_PUBLIC_BASE_URL: 'media.zurupos.com', MEDIA_LOCAL_DIR: '/x' })).toThrow(
      /MEDIA_PUBLIC_BASE_URL/,
    )
  })
})
