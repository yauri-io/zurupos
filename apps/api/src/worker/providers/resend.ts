import type { EmailSender } from './types.js'

// Production transactional provider (SPEC §10). Only used when EMAIL_PROVIDER=resend.
export const resendSender =
  (apiKey: string, fetchImpl: typeof fetch = fetch): EmailSender =>
  async (email) => {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: email.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    })
    if (!res.ok) throw new Error(`resend: HTTP ${res.status}`)
  }
