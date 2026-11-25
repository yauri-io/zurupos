// Daily summary email (SPEC §12.6, D-074). Sent every day, also when nothing was
// recorded: then it says so plainly instead of showing zeros.
import { escapeHtml } from './escape.js'
import { formatIdr, formatLongDay, formatPct, formatShortDay } from './format.js'
import type { EmailLocale, RenderedEmail } from './types.js'

export type PaymentMethod = 'cash' | 'qris' | 'debit' | 'credit' | 'transfer' | 'other'

export type DailySummaryInput = {
  locale: EmailLocale
  shopName: string
  day: string // business date
  link: string
  orders: bigint
  netSales: bigint
  averageOrderValue: bigint
  prevNetSales: bigint // same weekday a week earlier
  prevOrders: bigint
  changePct: bigint | null // null when that day had no orders
  payments: { method: PaymentMethod; amount: bigint }[]
  topItems: { name: string; qty: bigint; net: bigint }[]
  voids: { count: number; total: bigint }
  lowStockCount: number
}

const COPY = {
  id: {
    subject: (day: string, net: string) => `[ZuruPOS] Ringkasan ${day}: ${net}`,
    subjectEmpty: (day: string) => `[ZuruPOS] Ringkasan ${day}: tidak ada transaksi`,
    title: (shop: string, day: string) => `Ringkasan ${shop}, ${day}`,
    empty: 'Tidak ada transaksi tercatat.',
    net: 'Penjualan bersih',
    orders: 'Pesanan',
    aov: 'Rata-rata per pesanan',
    vsLastWeek: (pct: string) => `${pct} dibanding minggu lalu di hari yang sama`,
    lastWeek: (net: string, n: string) => `Minggu lalu di hari yang sama: ${net} (${n} pesanan)`,
    noLastWeek: 'Minggu lalu di hari yang sama tidak ada transaksi.',
    payments: 'Pembayaran',
    top: 'Menu terlaris',
    sold: (n: string) => `${n} terjual`,
    voids: (n: number, total: string) => `Pembatalan: ${n} pesanan (${total})`,
    lowStock: (n: number) => `Stok menipis: ${n} bahan`,
    cta: 'Buka dashboard',
    footer: 'Email ini bisa dimatikan di Pengaturan → Peringatan & perangkat.',
    methods: {
      cash: 'Tunai',
      qris: 'QRIS',
      debit: 'Kartu debit',
      credit: 'Kartu kredit',
      transfer: 'Transfer',
      other: 'Lainnya',
    },
  },
  en: {
    subject: (day: string, net: string) => `[ZuruPOS] Summary ${day}: ${net}`,
    subjectEmpty: (day: string) => `[ZuruPOS] Summary ${day}: no sales`,
    title: (shop: string, day: string) => `${shop} summary, ${day}`,
    empty: 'No sales were recorded.',
    net: 'Net sales',
    orders: 'Orders',
    aov: 'Average per order',
    vsLastWeek: (pct: string) => `${pct} on the same day last week`,
    lastWeek: (net: string, n: string) => `Same day last week: ${net} (${n} orders)`,
    noLastWeek: 'No sales on the same day last week.',
    payments: 'Payments',
    top: 'Best sellers',
    sold: (n: string) => `${n} sold`,
    voids: (n: number, total: string) => `Voids: ${n} orders (${total})`,
    lowStock: (n: number) => `Low stock: ${n} ingredients`,
    cta: 'Open the dashboard',
    footer: 'You can turn this email off in Settings → Alerts & device.',
    methods: {
      cash: 'Cash',
      qris: 'QRIS',
      debit: 'Debit card',
      credit: 'Credit card',
      transfer: 'Transfer',
      other: 'Other',
    },
  },
}

export const renderDailySummary = (i: DailySummaryInput): RenderedEmail => {
  const c = COPY[i.locale]
  const empty = i.orders === 0n
  const subject = empty
    ? c.subjectEmpty(formatShortDay(i.day, i.locale))
    : c.subject(formatShortDay(i.day, i.locale), formatIdr(i.netSales))

  // Each block is a list of lines; text and HTML are built from the same lines.
  const blocks: { heading?: string; lines: string[] }[] = []
  if (empty) {
    blocks.push({ lines: [c.empty] })
  } else {
    blocks.push({
      lines: [
        `${c.net}: ${formatIdr(i.netSales)}`,
        `${c.orders}: ${i.orders} · ${c.aov}: ${formatIdr(i.averageOrderValue)}`,
      ],
    })
  }
  blocks.push({
    lines: [
      ...(i.changePct !== null && !empty ? [c.vsLastWeek(formatPct(i.changePct))] : []),
      i.prevOrders > 0n ? c.lastWeek(formatIdr(i.prevNetSales), String(i.prevOrders)) : c.noLastWeek,
    ],
  })
  if (!empty && i.payments.length > 0) {
    blocks.push({
      heading: c.payments,
      lines: i.payments.map((p) => `${c.methods[p.method]}: ${formatIdr(p.amount)}`),
    })
  }
  if (!empty && i.topItems.length > 0) {
    blocks.push({
      heading: c.top,
      lines: i.topItems.map((t, n) => `${n + 1}. ${t.name}: ${c.sold(String(t.qty))}, ${formatIdr(t.net)}`),
    })
  }
  const alerts = [
    ...(i.voids.count > 0 ? [c.voids(i.voids.count, formatIdr(i.voids.total))] : []),
    ...(i.lowStockCount > 0 ? [c.lowStock(i.lowStockCount)] : []),
  ]
  if (alerts.length > 0) blocks.push({ lines: alerts })

  const title = c.title(i.shopName, formatLongDay(i.day, i.locale))
  const text =
    `${title}\n\n` +
    blocks.map((b) => (b.heading ? `${b.heading}\n` : '') + b.lines.join('\n')).join('\n\n') +
    `\n\n${c.cta}: ${i.link}\n\n${c.footer}\n`
  const html =
    `<h2 style="font-size:18px">${escapeHtml(title)}</h2>` +
    blocks
      .map(
        (b) =>
          (b.heading ? `<p style="margin:16px 0 4px"><strong>${escapeHtml(b.heading)}</strong></p>` : '') +
          `<p style="margin:${b.heading ? '0' : '12px 0 0'}">${b.lines.map(escapeHtml).join('<br>')}</p>`,
      )
      .join('') +
    `<p style="margin-top:16px"><a href="${escapeHtml(i.link)}">${escapeHtml(c.cta)}</a></p>` +
    `<p style="color:#666;font-size:12px">${escapeHtml(c.footer)}</p>`
  return { subject, text, html }
}
