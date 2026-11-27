// Public online menu (SPEC §9, §12.7). No credentials: the slug alone selects a
// published menu through auth.find_public_menu (D-081). In production Caddy
// serves these under menu.zurupos.com/v1/public/*, same origin as the page.
import type { Database } from '../../db/kysely.js'
import { apiError } from '../../http/errors.js'
import type { Limiters } from '../../http/rate-limit.js'
import type { App } from '../../http/types.js'
import type { MediaStore } from '../../media/store.js'
import { PublicMenuResponse, SlugParams } from './schemas.js'
import * as service from './service.js'

export const publicMenuRoutes = async (
  app: App,
  { db, limiters, media }: { db: Database; limiters: Limiters; media: MediaStore },
) => {
  app.get(
    '/public/menus/:slug',
    {
      config: { auth: 'none' },
      schema: { tags: ['public'], params: SlugParams, response: { 200: PublicMenuResponse } },
    },
    async (request, reply) => {
      if (!limiters.publicMenuByIp.hit(request.ip)) throw apiError('RATE_LIMITED')
      const result = await service.readPublicMenu(db, media, request.params.slug)
      // The menu app keeps its own 15 s copy; nothing in between should.
      return reply.header('cache-control', 'no-store').send(result)
    },
  )
}
