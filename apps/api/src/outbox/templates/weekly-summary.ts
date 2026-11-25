// Weekly summary email (SPEC §12.6, D-074): the week against the one before, the
// busy-hours insight (§12.4) and up to 3 menu actions (§12.5).
import { escapeHtml } from './escape.js'
import { formatIdr, formatPct, formatSpan, hourSpan, weekdayName } from './format.js'
import type { EmailLocale, RenderedEmail } from './types.js'

export type MenuAction =
  | { kind: 'naikkan_harga'; name: string; category: string; increase: bigint; extra30d: bigint }
  | { kind: 'promosikan'; name: string; category: string }

export type WeeklySummaryInput = {
  locale: EmailLocale
  shopName: string
  from: string // Monday
  to: string // Sunday
  links: { home: string; heatmap: string; menu: string }
  orders: bigint
  netSales: bigint
  prevOrders: bigint
  prevNetSales: bigint
  changePct: bigint | null // null when the week before had no net sales
  busy: {
    busiest: { weekday: number; hour: number }
    quietest: { weekday: number; hour: number }
    ratio: bigint | null
  } | null
  actions: MenuAction[]
  incompleteCategories: string[]
}

const COPY = {
  id: {
    subject: (span: string, net: string) => `[ZuruPOS] Ringkasan minggu ${span}: ${net}`,
    title: (shop: string, span: string) => `Ringkasan mingguan ${shop}, ${span}`,
    week: (net: string, n: string) => `Penjualan bersih: ${net} dari ${n} pesanan`,
    vs: (pct: string) => `${pct} dibanding minggu sebelumnya`,
    prev: (net: string, n: string) => `Minggu sebelumnya: ${net} dari ${n} pesanan`,
    noPrev: 'Minggu sebelumnya tidak ada transaksi.',
    busyTitle: 'Jam ramai (4 minggu terakhir)',
    busy: (b: string, q: string) => `Paling ramai ${b}, paling sepi ${q}.`,
    busyRatio: (b: string, q: string, r: string) => `${b} rata-rata ${r}× lebih ramai daripada ${q}.`,
    menuTitle: 'Saran menu (4 minggu terakhir)',
    raise: (name: string, cat: string, inc: string, extra: string) =>
      `${name} (${cat}): laris tapi untungnya kecil. Jika harga naik ${inc} dan jumlah terjual tetap, ±${extra} lebih banyak per 30 hari.`,
    promote: (name: string, cat: string) =>
      `${name} (${cat}): untungnya besar tapi kurang laris. Tawarkan ke pembeli atau taruh di tempat yang terlihat.`,
    incomplete: (cats: string) =>
      `HPP belum lengkap di kategori ${cats}, jadi Evaluasi menu belum bisa dipakai di sana. Lengkapi resep dan biaya bahannya.`,
    ctaHome: 'Buka dashboard',
    ctaHeatmap: 'Lihat Jam ramai',
    ctaMenu: 'Lihat Evaluasi menu',
    footer: 'Email ini bisa dimatikan di Pengaturan → Peringatan & perangkat.',
  },
  en: {
    subject: (span: string, net: string) => `[ZuruPOS] Week ${span}: ${net}`,
    title: (shop: string, span: string) => `${shop} weekly summary, ${span}`,
    week: (net: string, n: string) => `Net sales: ${net} from ${n} orders`,
    vs: (pct: string) => `${pct} on the week before`,
    prev: (net: string, n: string) => `Week before: ${net} from ${n} orders`,
    noPrev: 'No sales the week before.',
    busyTitle: 'Busy hours (last 4 weeks)',
    busy: (b: string, q: string) => `Busiest ${b}, quietest ${q}.`,
    busyRatio: (b: string, q: string, r: string) => `${b} is on average ${r}× busier than ${q}.`,
    menuTitle: 'Menu suggestions (last 4 weeks)',
    raise: (name: string, cat: string, inc: string, extra: string) =>
      `${name} (${cat}): sells well but earns little. If the price goes up ${inc} and the number sold stays the same, about ${extra} more per 30 days.`,
    promote: (name: string, cat: string) =>
      `${name} (${cat}): high margin but doesn't sell much. Suggest it to customers or give it a visible spot.`,
    incomplete: (cats: string) =>
      `Costs are incomplete in ${cats}, so Menu review can't be used there yet. Complete the recipes and ingredient costs.`,
    ctaHome: 'Open the dashboard',
    ctaHeatmap: 'See Busy hours',
    ctaMenu: 'See Menu review',
    footer: 'You can turn this email off in Settings → Alerts & device.',
  },
}

export const renderWeeklySummary = (i: WeeklySummaryInput): RenderedEmail => {
  const c = COPY[i.locale]
  const span = formatSpan(i.from, i.to, i.locale)
  const where = (p: { weekday: number; hour: number }) =>
    `${weekdayName(p.weekday, i.locale)} ${hourSpan(p.hour, i.locale)}`

  const blocks: { heading?: string; lines: string[]; link?: [string, string] }[] = [
    {
      lines: [
        c.week(formatIdr(i.netSales), String(i.orders)),
        ...(i.changePct !== null ? [c.vs(formatPct(i.changePct))] : []),
        i.prevOrders > 0n ? c.prev(formatIdr(i.prevNetSales), String(i.prevOrders)) : c.noPrev,
      ],
    },
  ]
  if (i.busy) {
    const b = where(i.busy.busiest)
    const q = where(i.busy.quietest)
    blocks.push({
      heading: c.busyTitle,
      lines: [i.busy.ratio !== null ? c.busyRatio(b, q, String(i.busy.ratio)) : c.busy(b, q)],
      link: [c.ctaHeatmap, i.links.heatmap],
    })
  }
  const menuLines = [
    ...i.actions.map((a) =>
      a.kind === 'naikkan_harga'
        ? c.raise(a.name, a.category, formatIdr(a.increase), formatIdr(a.extra30d))
        : c.promote(a.name, a.category),
    ),
    ...(i.incompleteCategories.length > 0 ? [c.incomplete(i.incompleteCategories.join(', '))] : []),
  ]
  if (menuLines.length > 0) {
    blocks.push({ heading: c.menuTitle, lines: menuLines, link: [c.ctaMenu, i.links.menu] })
  }

  const title = c.title(i.shopName, span)
  const text =
    `${title}\n\n` +
    blocks
      .map(
        (b) =>
          (b.heading ? `${b.heading}\n` : '') +
          b.lines.map((l) => (b.heading ? `- ${l}` : l)).join('\n') +
          (b.link ? `\n${b.link[0]}: ${b.link[1]}` : ''),
      )
      .join('\n\n') +
    `\n\n${c.ctaHome}: ${i.links.home}\n\n${c.footer}\n`
  const html =
    `<h2 style="font-size:18px">${escapeHtml(title)}</h2>` +
    blocks
      .map(
        (b) =>
          (b.heading ? `<p style="margin:16px 0 4px"><strong>${escapeHtml(b.heading)}</strong></p>` : '') +
          (b.heading
            ? `<ul style="margin:0;padding-left:20px">${b.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
            : `<p style="margin:12px 0 0">${b.lines.map(escapeHtml).join('<br>')}</p>`) +
          (b.link
            ? `<p style="margin:4px 0 0"><a href="${escapeHtml(b.link[1])}">${escapeHtml(b.link[0])}</a></p>`
            : ''),
      )
      .join('') +
    `<p style="margin-top:16px"><a href="${escapeHtml(i.links.home)}">${escapeHtml(c.ctaHome)}</a></p>` +
    `<p style="color:#666;font-size:12px">${escapeHtml(c.footer)}</p>`
  return { subject: c.subject(span, formatIdr(i.netSales)), text, html }
}
