// Privacy filter for dashboard error reports (D-053). Invite links carry a token
// in the path (/invite/<token>) and reset links in the query (/reset?token=...),
// so every URL is cut down before it leaves the browser.
import type { Breadcrumb, ErrorEvent } from '@sentry/vue'

export const scrubUrl = (url: string): string =>
  url.replace(/[?#].*$/, '').replace(/\/invite\/[^/]+/, '/invite/:token')

const scrubField = (data: Record<string, unknown>, key: string) => {
  const value = data[key]
  if (typeof value === 'string') data[key] = scrubUrl(value)
}

export const scrubBreadcrumb = (crumb: Breadcrumb): Breadcrumb => {
  if (crumb.data) {
    for (const key of ['url', 'from', 'to']) scrubField(crumb.data, key)
  }
  return crumb
}

export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url)
    delete event.request.query_string
    delete event.request.cookies
    delete event.request.data
    // Keep the browser name; drop Referer (it can hold a token) and the rest.
    const userAgent = event.request.headers?.['User-Agent']
    event.request.headers = userAgent ? { 'User-Agent': userAgent } : {}
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction)
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb)
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {}
  return event
}
