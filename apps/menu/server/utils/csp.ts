// The menu page's Content-Security-Policy (SPEC §15): scripts only from this
// site (plus Nuxt's two inline scripts, by nonce), images only from this site
// and the media domain, no third parties, not framed. No X-Robots-Tag: the
// page is meant to be found (unlike the dashboard and API, D-061).
export const mediaSource = (mediaBaseUrl: string): string => {
  const url = new URL(mediaBaseUrl)
  return `${url.origin}${url.pathname.replace(/\/?$/, '/')}`
}

export const menuCsp = (nonce: string, mediaBaseUrl: string): string =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    // Style attributes carry the template tokens and the shop's colour.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${mediaSource(mediaBaseUrl)}`,
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')

// Adds the nonce to every <script> tag that doesn't have one.
export const withNonce = (chunks: string[], nonce: string): string[] =>
  chunks.map((chunk) => chunk.replace(/<script(?![^>]*\snonce=)/g, `<script nonce="${nonce}"`))
