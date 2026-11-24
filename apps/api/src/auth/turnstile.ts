// Cloudflare Turnstile check on dashboard login (D-064).
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

export type TurnstileResult = 'ok' | 'rejected' | 'unavailable'

export type TurnstileVerifier = (token: string, remoteIp: string) => Promise<TurnstileResult>

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// Fails closed: if Cloudflare can't be reached, the login is refused.
export const createTurnstileVerifier =
  (secretKey: string, fetchFn: typeof fetch = fetch, timeoutMs = 5000): TurnstileVerifier =>
  async (token, remoteIp) => {
    let res: Response
    try {
      res = await fetchFn(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: secretKey, response: token, remoteip: remoteIp }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch {
      return 'unavailable'
    }
    if (!res.ok) return 'unavailable'
    try {
      const body = (await res.json()) as { success?: unknown }
      return body.success === true ? 'ok' : 'rejected'
    } catch {
      return 'unavailable'
    }
  }
