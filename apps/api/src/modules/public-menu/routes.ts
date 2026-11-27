// Public online menu (SPEC §9, §12.7). No credentials: the slug alone selects a
// published menu through auth.find_public_menu (D-081). In production Caddy
// serves these under menu.zurupos.com/v1/public/*, same origin as the page.
import type { Database } from '../../db/kysely.js'
import { apiError } from '../../http/errors.js'
import type { Limiters } from '../../http/rate-limit.js'
import type { App } from '../../http/types.js'
import type { MediaStore } from '../../media/store.js'
import { NoContent } from '../../http/schemas.js'
import { PublicMenuResponse, SlugParams } from './schemas.js'
import * as service from './service.js'
import { createViewWindow } from './view-window.js'

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

  // View beacon (O3, D-083, D-092). navigator.sendBeacon posts text/plain with
  // no custom headers, so this route takes no credentials and skips the
  // dashboard CSRF check. It always answers 204: the page never waits on it.
  const views = createViewWindow()
  app.addContentTypeParser('text/plain', { parseAs: 'string', bodyLimit: 1024 }, (_req, body, done) => {
    done(null, body)
  })
  app.post(
    '/public/menus/:slug/views',
    {
      config: { auth: 'none', csrf: false },
      bodyLimit: 1024,
      schema: { tags: ['public'], params: SlugParams, response: { 204: NoContent } },
    },
    async (request, reply) => {
      if (limiters.menuViewsByIp.hit(request.ip)) {
        try {
          await service.recordView(db, views, {
            slug: request.params.slug,
            source: service.sourceOf(request.body),
            ip: request.ip,
            userAgent: request.headers['user-agent'],
          })
        } catch (err) {
          // A lost view is fine; an error page for a beacon is not.
          request.log.warn({ err }, 'menu view not counted')
        }
      }
      return reply.status(204).send(null)
    },
  )
}
