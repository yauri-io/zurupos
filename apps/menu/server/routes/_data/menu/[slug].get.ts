// Page data for the SSR render (called in-process by pages/[slug].vue).
export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  setResponseHeader(event, 'cache-control', 'no-store')
  return fetchMenuData(event, slug, clientIpOf(event))
})
