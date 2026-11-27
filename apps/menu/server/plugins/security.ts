// Security headers for every server-rendered page, with a fresh nonce per response.
import { randomBytes } from 'node:crypto'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:html', (html, { event }) => {
    const nonce = randomBytes(16).toString('base64')
    html.head = withNonce(html.head, nonce)
    html.bodyPrepend = withNonce(html.bodyPrepend, nonce)
    html.body = withNonce(html.body, nonce)
    html.bodyAppend = withNonce(html.bodyAppend, nonce)
    const { mediaBaseUrl } = useRuntimeConfig(event)
    setResponseHeaders(event, {
      'content-security-policy': menuCsp(nonce, mediaBaseUrl),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    })
  })
})
