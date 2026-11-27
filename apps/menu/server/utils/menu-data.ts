// The public payload per slug, kept for 15 s (SPEC §12.7): a sold-out tap shows
// within about 15 s, and a busy page costs the API one request per slug per 15 s.
// Types only: the server bundle never loads the page components.
import type { PublicMenu } from '@zurupos/menu-ui/types'
import type { H3Event } from 'h3'

export type MenuData =
  { kind: 'menu'; menu: PublicMenu } | { kind: 'moved'; slug: string } | { kind: 'not_found' }

const SLUG = /^[a-z0-9-]{1,64}$/i

export const fetchMenuData = defineCachedFunction(
  async (event: H3Event, slug: string, clientIp: string): Promise<MenuData> => {
    if (!SLUG.test(slug)) return { kind: 'not_found' }
    const { apiInternalBase } = useRuntimeConfig(event)
    const res = await $fetch.raw<PublicMenu | { kind: 'moved'; slug: string }>(
      `${apiInternalBase}/v1/public/menus/${encodeURIComponent(slug)}`,
      {
        // The API's per-IP rate limit should see the visitor, not this server.
        headers: { accept: 'application/json', 'x-forwarded-for': clientIp },
        ignoreResponseError: true,
        retry: 0,
        timeout: 5000,
      },
    )
    if (res.status === 404) return { kind: 'not_found' }
    const body = res._data
    if (res.status !== 200 || !body) {
      // Not cached: the next request tries again.
      throw createError({ statusCode: 503, statusMessage: 'Menu unavailable' })
    }
    return body.kind === 'moved' ? { kind: 'moved', slug: body.slug } : { kind: 'menu', menu: body }
  },
  {
    name: 'public-menu',
    maxAge: 15,
    swr: false,
    getKey: (_event: H3Event, slug: string) => slug,
  },
)

// Caddy sets X-Forwarded-For to the client IP (deploy/Caddyfile); locally it's the socket.
export const clientIpOf = (event: H3Event): string =>
  getRequestIP(event, { xForwardedFor: true })?.split(',')[0]?.trim() ?? 'unknown'
