import { escapeHtml } from './escape.js'
import type { EmailLocale, RenderedEmail } from './types.js'

const COPY = {
  id: {
    subject: '[ZuruPOS] Atur ulang kata sandi',
    greeting: (name: string) => `Halo ${name},`,
    body: 'Kami menerima permintaan untuk mengatur ulang kata sandi akun ZuruPOS Anda. Tautan ini berlaku 1 jam.',
    cta: 'Atur ulang kata sandi',
    ignore: 'Jika Anda tidak meminta ini, abaikan email ini.',
  },
  en: {
    subject: '[ZuruPOS] Reset your password',
    greeting: (name: string) => `Hi ${name},`,
    body: 'We received a request to reset your ZuruPOS password. This link is valid for 1 hour.',
    cta: 'Reset password',
    ignore: "If you didn't request this, you can ignore this email.",
  },
}

export const renderPasswordReset = (input: {
  locale: EmailLocale
  name: string
  link: string
}): RenderedEmail => {
  const c = COPY[input.locale]
  return {
    subject: c.subject,
    text: `${c.greeting(input.name)}\n\n${c.body}\n\n${c.cta}: ${input.link}\n\n${c.ignore}\n`,
    html:
      `<p>${escapeHtml(c.greeting(input.name))}</p><p>${escapeHtml(c.body)}</p>` +
      `<p><a href="${escapeHtml(input.link)}">${escapeHtml(c.cta)}</a></p><p>${escapeHtml(c.ignore)}</p>`,
  }
}
