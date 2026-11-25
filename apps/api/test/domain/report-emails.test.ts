import { describe, expect, it } from 'vitest'
import { renderDailySummary, type DailySummaryInput } from '../../src/outbox/templates/daily-summary.js'
import { formatIdr, formatPct, formatSpan } from '../../src/outbox/templates/format.js'
import { renderWeeklySummary, type WeeklySummaryInput } from '../../src/outbox/templates/weekly-summary.js'

describe('email formats', () => {
  it('formats rupiah like the dashboard', () => {
    expect(formatIdr(1_234_000n)).toBe('Rp 1.234.000')
    expect(formatIdr(0n)).toBe('Rp 0')
    expect(formatIdr(-5_000n)).toBe('-Rp 5.000')
  })
  it('formats signed percents and week spans', () => {
    expect(formatPct(12n)).toBe('+12%')
    expect(formatPct(-5n)).toBe('-5%')
    expect(formatPct(0n)).toBe('0%')
    expect(formatSpan('2026-11-23', '2026-11-29', 'id')).toBe('23–29 Nov')
    expect(formatSpan('2026-11-30', '2026-12-06', 'id')).toBe('30 Nov – 6 Des')
  })
})

const daily: DailySummaryInput = {
  locale: 'id',
  shopName: 'Kopi <Senja>',
  day: '2026-11-26',
  link: 'https://app.example/',
  orders: 42n,
  netSales: 1_234_000n,
  averageOrderValue: 29_381n,
  prevNetSales: 1_100_000n,
  prevOrders: 40n,
  changePct: 12n,
  payments: [
    { method: 'qris', amount: 800_000n },
    { method: 'cash', amount: 557_400n },
  ],
  topItems: [{ name: 'Kopi Susu Aren', qty: 18n, net: 450_000n }],
  voids: { count: 1, total: 27_500n },
  lowStockCount: 2,
}

describe('renderDailySummary', () => {
  it('lists the day, the comparison, payments, best sellers and alerts', () => {
    const e = renderDailySummary(daily)
    expect(e.subject).toBe('[ZuruPOS] Ringkasan Kamis, 26 Nov: Rp 1.234.000')
    expect(e.text).toContain('Ringkasan Kopi <Senja>, Kamis, 26 November 2026')
    expect(e.text).toContain('Penjualan bersih: Rp 1.234.000')
    expect(e.text).toContain('Pesanan: 42 · Rata-rata per pesanan: Rp 29.381')
    expect(e.text).toContain('+12% dibanding minggu lalu di hari yang sama')
    expect(e.text).toContain('QRIS: Rp 800.000\nTunai: Rp 557.400')
    expect(e.text).toContain('1. Kopi Susu Aren: 18 terjual, Rp 450.000')
    expect(e.text).toContain('Pembatalan: 1 pesanan (Rp 27.500)')
    expect(e.text).toContain('Stok menipis: 2 bahan')
    expect(e.text).toContain('Buka dashboard: https://app.example/')
    // Shop names are escaped in HTML.
    expect(e.html).toContain('Kopi &lt;Senja&gt;')
    expect(e.html).not.toContain('<Senja>')
  })

  it('says plainly when nothing was recorded, and still compares and warns', () => {
    const e = renderDailySummary({
      ...daily,
      orders: 0n,
      netSales: 0n,
      averageOrderValue: 0n,
      changePct: -100n,
      payments: [],
      topItems: [],
      voids: { count: 0, total: 0n },
    })
    expect(e.subject).toBe('[ZuruPOS] Ringkasan Kamis, 26 Nov: tidak ada transaksi')
    expect(e.text).toContain('Tidak ada transaksi tercatat.')
    expect(e.text).toContain('Minggu lalu di hari yang sama: Rp 1.100.000 (40 pesanan)')
    expect(e.text).not.toContain('Penjualan bersih:')
    expect(e.text).not.toContain('-100%')
    expect(e.text).toContain('Stok menipis: 2 bahan')
  })

  it('has an English version', () => {
    const e = renderDailySummary({ ...daily, locale: 'en', prevOrders: 0n, changePct: null })
    expect(e.subject).toBe('[ZuruPOS] Summary Thursday 26 Nov: Rp 1.234.000')
    expect(e.text).toContain('No sales on the same day last week.')
    expect(e.text).toContain('QRIS: Rp 800.000\nCash: Rp 557.400')
  })
})

const weekly: WeeklySummaryInput = {
  locale: 'id',
  shopName: 'Kopi Senja',
  from: '2026-11-23',
  to: '2026-11-29',
  links: {
    home: 'https://app.example/',
    heatmap: 'https://app.example/reports/heatmap',
    menu: 'https://app.example/reports/menu',
  },
  orders: 280n,
  netSales: 8_400_000n,
  prevOrders: 250n,
  prevNetSales: 7_500_000n,
  changePct: 12n,
  busy: { busiest: { weekday: 6, hour: 15 }, quietest: { weekday: 2, hour: 13 }, ratio: 3n },
  actions: [
    { kind: 'naikkan_harga', name: 'Es Kopi Murah', category: 'Kopi', increase: 2_000n, extra30d: 120_000n },
    { kind: 'promosikan', name: 'Kopi Hitam', category: 'Kopi' },
  ],
  incompleteCategories: ['Teh'],
}

describe('renderWeeklySummary', () => {
  it('shows the week, busy hours and menu actions', () => {
    const e = renderWeeklySummary(weekly)
    expect(e.subject).toBe('[ZuruPOS] Ringkasan minggu 23–29 Nov: Rp 8.400.000')
    expect(e.text).toContain('Penjualan bersih: Rp 8.400.000 dari 280 pesanan')
    expect(e.text).toContain('+12% dibanding minggu sebelumnya')
    expect(e.text).toContain('Minggu sebelumnya: Rp 7.500.000 dari 250 pesanan')
    expect(e.text).toContain('- Sabtu 15.00–16.00 rata-rata 3× lebih ramai daripada Selasa 13.00–14.00.')
    expect(e.text).toContain('- Es Kopi Murah (Kopi): laris tapi untungnya kecil. Jika harga naik Rp 2.000')
    expect(e.text).toContain('±Rp 120.000 lebih banyak per 30 hari.')
    expect(e.text).toContain('- Kopi Hitam (Kopi): untungnya besar tapi kurang laris.')
    expect(e.text).toContain('HPP belum lengkap di kategori Teh')
    expect(e.text).toContain('Lihat Evaluasi menu: https://app.example/reports/menu')
  })

  it('leaves out busy hours and menu suggestions when there is nothing to say', () => {
    const e = renderWeeklySummary({
      ...weekly,
      busy: null,
      actions: [],
      incompleteCategories: [],
      changePct: null,
      prevOrders: 0n,
    })
    expect(e.text).not.toContain('Jam ramai')
    expect(e.text).not.toContain('Saran menu')
    expect(e.text).toContain('Minggu sebelumnya tidak ada transaksi.')
  })
})
