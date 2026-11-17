import { escapeHtml } from './escape.js'
import { formatStock } from './format-qty.js'
import type { EmailLocale, RenderedEmail } from './types.js'

export type LowStockLine = { name: string; baseUnit: string; stockQty: bigint; threshold: bigint }

const COPY = {
  id: {
    subject: (names: string) => `[ZuruPOS] Stok menipis: ${names}`,
    more: (n: number) => `+${n} lainnya`,
    intro: (shop: string) => `Stok bahan berikut di ${shop} sudah mencapai batas menipis:`,
    ingredient: 'Bahan',
    stock: 'Stok sekarang',
    threshold: 'Batas',
    cta: 'Buka inventaris',
  },
  en: {
    subject: (names: string) => `[ZuruPOS] Low stock: ${names}`,
    more: (n: number) => `+${n} more`,
    intro: (shop: string) => `These ingredients at ${shop} have reached their low-stock level:`,
    ingredient: 'Ingredient',
    stock: 'Current stock',
    threshold: 'Threshold',
    cta: 'Open inventory',
  },
}

// SPEC §8: one email lists every ingredient that crossed in the same change.
export const renderLowStock = (input: {
  locale: EmailLocale
  shopName: string
  lines: LowStockLine[]
  link: string
}): RenderedEmail => {
  const c = COPY[input.locale]
  const names = input.lines.map((l) => l.name)
  const shown = names.slice(0, 3).join(', ')
  const subject = c.subject(names.length > 3 ? `${shown} ${c.more(names.length - 3)}` : shown)
  const rows = input.lines.map((l) => ({
    name: l.name,
    stock: formatStock(l.stockQty, l.baseUnit, input.locale),
    threshold: formatStock(l.threshold, l.baseUnit, input.locale),
  }))
  const text =
    `${c.intro(input.shopName)}\n\n` +
    rows.map((r) => `- ${r.name}: ${r.stock} (${c.threshold.toLowerCase()} ${r.threshold})`).join('\n') +
    `\n\n${c.cta}: ${input.link}\n`
  const cell = 'style="padding:4px 12px 4px 0;text-align:left"'
  const html =
    `<p>${escapeHtml(c.intro(input.shopName))}</p>` +
    `<table><thead><tr><th ${cell}>${escapeHtml(c.ingredient)}</th><th ${cell}>${escapeHtml(c.stock)}</th>` +
    `<th ${cell}>${escapeHtml(c.threshold)}</th></tr></thead><tbody>` +
    rows
      .map(
        (r) =>
          `<tr><td ${cell}>${escapeHtml(r.name)}</td><td ${cell}>${escapeHtml(r.stock)}</td>` +
          `<td ${cell}>${escapeHtml(r.threshold)}</td></tr>`,
      )
      .join('') +
    `</tbody></table><p><a href="${escapeHtml(input.link)}">${escapeHtml(c.cta)}</a></p>`
  return { subject, text, html }
}
