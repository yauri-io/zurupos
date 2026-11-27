// MEDIA_DRIVER=s3: objects in an S3-API bucket, in production Cloudflare R2
// (D-079), public through its custom domain (MEDIA_PUBLIC_BASE_URL). Signed with
// SigV4 by aws4fetch; path-style URLs, which R2 supports.
import { AwsClient } from 'aws4fetch'
import { assertObjectKey, MEDIA_CACHE_CONTROL, MEDIA_CONTENT_TYPE, type MediaStore } from './store.js'

export type S3StoreOptions = {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
  // R2 takes 'auto'; any value works for S3-compatible test servers.
  region?: string
  fetch?: typeof fetch
}

export const createS3Store = (opts: S3StoreOptions): MediaStore => {
  const client = new AwsClient({
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    service: 's3',
    region: opts.region ?? 'auto',
  })
  const objectUrl = (key: string) => {
    assertObjectKey(key)
    return `${opts.endpoint}/${encodeURIComponent(opts.bucket)}/${key}`
  }
  const send = async (url: string, init: RequestInit) => {
    const request = await client.sign(url, init)
    return (opts.fetch ?? fetch)(request)
  }

  return {
    put: async (key, body) => {
      const res = await send(objectUrl(key), {
        method: 'PUT',
        body: new Uint8Array(body),
        headers: { 'content-type': MEDIA_CONTENT_TYPE, 'cache-control': MEDIA_CACHE_CONTROL },
      })
      // Never include the response body: it may echo request details.
      if (!res.ok) throw new Error(`media store: PUT failed with HTTP ${res.status}`)
    },
    delete: async (key) => {
      const res = await send(objectUrl(key), { method: 'DELETE' })
      if (!res.ok && res.status !== 404) throw new Error(`media store: DELETE failed with HTTP ${res.status}`)
    },
    url: (key) => {
      assertObjectKey(key)
      return `${opts.publicBaseUrl}/${key}`
    },
  }
}
