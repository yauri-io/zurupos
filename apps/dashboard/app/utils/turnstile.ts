// Loads Cloudflare's Turnstile script once, on the first page that needs it (D-064).
// Cloudflare requires the script from this exact URL: no self-hosting or bundling.

export type TurnstileOptions = {
  sitekey: string
  action?: string
  language?: string
  theme?: 'auto' | 'light' | 'dark'
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
}

export type TurnstileApi = {
  render: (el: HTMLElement, options: TurnstileOptions) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loading: Promise<TurnstileApi> | null = null

const current = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile

export const loadTurnstile = (): Promise<TurnstileApi> => {
  const ready = current()
  if (ready) return Promise.resolve(ready)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.onload = () => {
      const api = current()
      if (api) resolve(api)
      else reject(new Error('turnstile script loaded without window.turnstile'))
    }
    script.onerror = () => reject(new Error('turnstile script failed to load'))
    document.head.appendChild(script)
  }).catch((err: unknown) => {
    // Let a later visit to the page try again.
    loading = null
    throw err
  })
  return loading
}
