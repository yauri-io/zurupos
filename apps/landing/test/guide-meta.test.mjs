// node --test apps/landing/test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { currentMetas, formatMb, pageCount, pagePath, render } from '../scripts/guide-meta.mjs'

const fakePdf = (pages) =>
  Buffer.from(
    `%PDF-1.7\n1 0 obj <</Type /Pages /Count ${pages}>> endobj\n` +
      Array.from({ length: pages }, (_, i) => `${i + 2} 0 obj <</Type /Page /Parent 1 0 R>> endobj\n`).join(
        '',
      ),
    'latin1',
  )

test('pageCount counts page objects, not the page tree', () => {
  assert.equal(pageCount(fakePdf(3)), 3)
  assert.equal(pageCount(Buffer.from('<</Type/Page>> <</Type/Pages>> <</Type /Page>>', 'latin1')), 2)
})

test('pageCount refuses what it cannot count', () => {
  assert.throws(() => pageCount(Buffer.from('%PDF-1.7\n<</Type /Catalog>>', 'latin1')), /no pages/)
  assert.throws(() => pageCount(Buffer.from('<</Type /ObjStm>> <</Type /Page>>', 'latin1')), /object streams/)
})

test('formatMb uses decimal megabytes and a comma', () => {
  assert.equal(formatMb(3146283), '3,1 MB')
  assert.equal(formatMb(3883192), '3,9 MB')
  assert.equal(formatMb(950000), '1,0 MB')
})

test('render replaces only the matching guide and reports the change', () => {
  const html =
    '<a href="https://dl.zurupos.com/panduan/a.pdf" type="application/pdf">\n  Unduh PDF <span class="guide-meta">1 halaman · 0,1 MB</span></a>' +
    '<a href="https://dl.zurupos.com/panduan/b.pdf">Unduh PDF <span class="guide-meta">2 halaman · 0,2 MB</span></a>'
  const out = render(html, { 'a.pdf': '5 halaman · 1,0 MB' })
  assert.match(out.html, /a\.pdf[^]*5 halaman · 1,0 MB/)
  assert.match(out.html, /2 halaman · 0,2 MB/)
  assert.deepEqual(out.changes, [{ name: 'a.pdf', from: '1 halaman · 0,1 MB', to: '5 halaman · 1,0 MB' }])
  assert.throws(() => render(html, { 'c.pdf': 'x' }), /no download link for c\.pdf/)
})

// The PDFs in docs/user are the ones the guide workflow publishes (D-093).
test('the download page shows the page count and size of each guide PDF', () => {
  const { changes } = render(readFileSync(pagePath, 'utf8'), currentMetas())
  assert.deepEqual(changes, [], 'run node apps/landing/scripts/guide-meta.mjs')
})
