// Local development only: the browser's /v1/public/* calls go to the API, as
// Caddy does in production (where this route is never reached).
export default defineEventHandler((event) => {
  const { apiInternalBase } = useRuntimeConfig(event)
  return proxyRequest(event, `${apiInternalBase}${event.path}`, {
    headers: { 'x-forwarded-for': clientIpOf(event) },
  })
})
