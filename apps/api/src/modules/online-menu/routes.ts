// Online menu, dashboard side (SPEC §9, §12.7). No public route here: those
// come with auth.find_public_menu in O2 (modules/public-menu).
import multipart from '@fastify/multipart'
import type { FastifyRequest } from 'fastify'
import { requireAuth } from '../../http/require-auth.js'
import { IdParams } from '../../http/schemas.js'
import type { App } from '../../http/types.js'
import { commitMediaChange, storeUpload, type ReplacedMedia } from '../../media/flow.js'
import { readUpload, UPLOAD_LIMITS } from '../../media/read-upload.js'
import type { MediaStore } from '../../media/store.js'
import type { MediaPurpose } from '../../media/variants.js'
import type { Tx } from '../../db/with-tenant.js'
import { ItemResponse } from '../items/schemas.js'
import { buildMenu } from '../public-menu/service.js'
import { PublicMenu } from '../public-menu/schemas.js'
import {
  HoursBody,
  OnlineMenuResponse,
  PreviewQuery,
  ViewsQuery,
  ViewsResponse,
  UPLOAD_CONSUMES,
  UpdateOnlineMenuBody,
} from './schemas.js'
import * as service from './service.js'

const OWNER = { auth: 'user', permission: 'online_menu.manage' } as const
const ITEMS = { auth: 'user', permission: 'online_menu.items' } as const
const tags = ['online-menu']

export const onlineMenuRoutes = async (
  app: App,
  { media, menuBaseUrl }: { media: MediaStore; menuBaseUrl: string },
) => {
  const deps: service.OnlineMenuDeps = { store: media, menuBaseUrl }
  // Scoped to this plugin: only these routes accept multipart bodies.
  await app.register(multipart, { limits: UPLOAD_LIMITS })

  // The §12.7 order of work: process and store the upload, then the database
  // change, then remove the replaced objects (or the new ones on failure).
  const upload = async <T>(
    request: FastifyRequest,
    purpose: MediaPurpose,
    change: (
      trx: Tx,
      created: Awaited<ReturnType<typeof storeUpload>>,
    ) => Promise<{
      result: T
      replaced: readonly ReplacedMedia[]
    }>,
  ): Promise<T> => {
    const file = await readUpload(request)
    const created = await storeUpload(media, request.log, file, purpose)
    return commitMediaChange(media, request.log, [created], () =>
      request.tenantTx((trx) => change(trx, created)),
    )
  }
  const removal = <T>(
    request: FastifyRequest,
    change: (trx: Tx) => Promise<{ result: T; replaced: readonly ReplacedMedia[] }>,
  ): Promise<T> => commitMediaChange(media, request.log, [], () => request.tenantTx(change))

  app.get(
    '/online-menu',
    { config: OWNER, schema: { tags, response: { 200: OnlineMenuResponse } } },
    async (request) => request.tenantTx((trx) => service.present(trx, requireAuth(request.auth), deps)),
  )

  // The public payload for this shop, published or not, so the dashboard's
  // preview renders the real page (D-082). Never sends a view beacon.
  app.get(
    '/online-menu/preview',
    { config: OWNER, schema: { tags, querystring: PreviewQuery, response: { 200: PublicMenu } } },
    async (request) =>
      request.tenantTx((trx) => buildMenu(trx, requireAuth(request.auth).tenantId, media, request.query)),
  )

  app.get(
    '/online-menu/views',
    { config: OWNER, schema: { tags, querystring: ViewsQuery, response: { 200: ViewsResponse } } },
    async (request) =>
      request.tenantTx((trx) =>
        service.views(trx, requireAuth(request.auth), Number(request.query.days ?? '30')),
      ),
  )

  app.patch(
    '/online-menu',
    { config: OWNER, schema: { tags, body: UpdateOnlineMenuBody, response: { 200: OnlineMenuResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.updateProfile(trx, requireAuth(request.auth), deps, request.body)),
  )

  app.put(
    '/online-menu/hours',
    { config: OWNER, schema: { tags, body: HoursBody, response: { 200: OnlineMenuResponse } } },
    async (request) =>
      request.tenantTx((trx) => service.setHours(trx, requireAuth(request.auth), deps, request.body.hours)),
  )

  app.post(
    '/online-menu/publish',
    { config: OWNER, schema: { tags, response: { 200: OnlineMenuResponse } } },
    async (request) => request.tenantTx((trx) => service.publish(trx, requireAuth(request.auth), deps)),
  )

  app.post(
    '/online-menu/unpublish',
    { config: OWNER, schema: { tags, response: { 200: OnlineMenuResponse } } },
    async (request) => request.tenantTx((trx) => service.unpublish(trx, requireAuth(request.auth), deps)),
  )

  for (const slot of ['logo', 'cover'] as const) {
    app.put(
      `/online-menu/${slot}`,
      { config: OWNER, schema: { tags, consumes: UPLOAD_CONSUMES, response: { 200: OnlineMenuResponse } } },
      async (request) =>
        upload(request, slot, (trx, created) =>
          service.setProfileImage(trx, requireAuth(request.auth), deps, slot, created),
        ),
    )
    app.delete(
      `/online-menu/${slot}`,
      { config: OWNER, schema: { tags, response: { 200: OnlineMenuResponse } } },
      async (request) =>
        removal(request, (trx) => service.removeProfileImage(trx, requireAuth(request.auth), deps, slot)),
    )
  }

  app.post(
    '/online-menu/gallery',
    { config: OWNER, schema: { tags, consumes: UPLOAD_CONSUMES, response: { 201: OnlineMenuResponse } } },
    async (request, reply) => {
      const result = await upload(request, 'gallery', (trx, created) =>
        service.addGalleryPhoto(trx, requireAuth(request.auth), deps, created),
      )
      return reply.status(201).send(result)
    },
  )

  app.delete(
    '/online-menu/gallery/:id',
    { config: OWNER, schema: { tags, params: IdParams, response: { 200: OnlineMenuResponse } } },
    async (request) =>
      removal(request, (trx) =>
        service.removeGalleryPhoto(trx, requireAuth(request.auth), deps, request.params.id),
      ),
  )

  app.put(
    '/items/:id/photo',
    {
      config: ITEMS,
      schema: { tags, params: IdParams, consumes: UPLOAD_CONSUMES, response: { 200: ItemResponse } },
    },
    async (request) =>
      upload(request, 'item', (trx, created) =>
        service.setItemPhoto(trx, requireAuth(request.auth), deps, request.params.id, created),
      ),
  )

  app.delete(
    '/items/:id/photo',
    { config: ITEMS, schema: { tags, params: IdParams, response: { 200: ItemResponse } } },
    async (request) =>
      removal(request, (trx) =>
        service.removeItemPhoto(trx, requireAuth(request.auth), deps, request.params.id),
      ),
  )
}
