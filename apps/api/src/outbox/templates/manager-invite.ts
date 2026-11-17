import { escapeHtml } from './escape.js'
import type { EmailLocale, RenderedEmail } from './types.js'

const COPY = {
  id: {
    subject: (shop: string) => `[ZuruPOS] Undangan sebagai manajer di ${shop}`,
    greeting: (name: string) => `Halo ${name},`,
    body: (shop: string) =>
      `Anda diundang sebagai manajer di ${shop}. Buat kata sandi untuk masuk ke dasbor ZuruPOS. Tautan ini berlaku 72 jam.`,
    cta: 'Buat kata sandi',
  },
  en: {
    subject: (shop: string) => `[ZuruPOS] You're invited as a manager at ${shop}`,
    greeting: (name: string) => `Hi ${name},`,
    body: (shop: string) =>
      `You've been invited as a manager at ${shop}. Set a password to sign in to the ZuruPOS dashboard. This link is valid for 72 hours.`,
    cta: 'Set password',
  },
}

export const renderManagerInvite = (input: {
  locale: EmailLocale
  name: string
  shopName: string
  link: string
}): RenderedEmail => {
  const c = COPY[input.locale]
  return {
    subject: c.subject(input.shopName),
    text: `${c.greeting(input.name)}\n\n${c.body(input.shopName)}\n\n${c.cta}: ${input.link}\n`,
    html:
      `<p>${escapeHtml(c.greeting(input.name))}</p><p>${escapeHtml(c.body(input.shopName))}</p>` +
      `<p><a href="${escapeHtml(input.link)}">${escapeHtml(c.cta)}</a></p>`,
  }
}
