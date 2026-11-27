// Profile field rules that a schema pattern can't express (SPEC §4.1, §12.7).

// Google Maps links only, so the "Buka peta" button can't send customers to an
// arbitrary site: https on google.com/maps (and www.), maps.google.com,
// maps.app.goo.gl or goo.gl/maps. No credentials or ports in the URL.
export const isAllowedMapsUrl = (value: string): boolean => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  const path = url.pathname
  const under = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`)
  if (host === 'google.com' || host === 'www.google.com') return under('/maps')
  if (host === 'goo.gl') return under('/maps')
  return host === 'maps.google.com' || host === 'maps.app.goo.gl'
}

// Times are HH:MM in the API and `time` in the database.
export const toHhMm = (time: string): string => time.slice(0, 5)
