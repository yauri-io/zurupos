// MEDIA_DRIVER=local only: serves the variants under /media/m/<file> the way the
// R2 custom domain does in production (immutable, public). Hidden from the
// OpenAPI document: it carries no tenant data (random keys) and no /v1 contract.
import { readFile } from 'node:fs/promises'
import { Type } from 'typebox'
import { apiError } from '../http/errors.js'
import type { App } from '../http/types.js'
import { localFilePath } from './local-store.js'
import { MEDIA_CACHE_CONTROL, MEDIA_CONTENT_TYPE, OBJECT_KEY } from './store.js'

const Params = Type.Object({ file: Type.String({ maxLength: 64 }) }, { additionalProperties: false })

export const localMediaRoutes = async (app: App, { dir }: { dir: string }) => {
  app.get(
    '/media/m/:file',
    { config: { auth: 'none' }, schema: { hide: true, params: Params } },
    async (request, reply) => {
      const key = `m/${request.params.file}`
      if (!OBJECT_KEY.test(key)) throw apiError('NOT_FOUND')
      let body: Buffer
      try {
        body = await readFile(localFilePath(dir, key))
      } catch {
        throw apiError('NOT_FOUND')
      }
      return (
        reply
          .header('content-type', MEDIA_CONTENT_TYPE)
          .header('cache-control', MEDIA_CACHE_CONTROL)
          // The dashboard (another origin locally) shows these images.
          .header('cross-origin-resource-policy', 'cross-origin')
          .send(body)
      )
    },
  )
}
