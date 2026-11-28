// Page count and size of each user guide PDF, as zurupos.com/panduan/ shows them (D-066, D-093).
//   node apps/landing/scripts/guide-meta.mjs           rewrite them in panduan/index.html
//   node apps/landing/scripts/guide-meta.mjs --check   exit 1 if the page doesn't match the PDFs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
export const pdfDir = join(root, 'docs/user')
export const pagePath = join(root, 'apps/landing/panduan/index.html')
export const guideNames = [
  'zurupos-panduan-1-pengantar-persiapan.pdf',
  'zurupos-panduan-2-di-kasir.pdf',
  'zurupos-panduan-3-stok-laporan.pdf',
]

// Counts page objects. The Claude Docs export writes plain objects; a PDF with
// compressed object streams would hide them, so that is refused rather than miscounted.
export const pageCount = (bytes) => {
  const text = Buffer.from(bytes).toString('latin1')
  if (/\/Type\s*\/ObjStm/.test(text)) throw new Error('PDF uses object streams; cannot count its pages')
  const pages = (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length
  if (pages === 0) throw new Error('no pages found in PDF')
  return pages
}

// Decimal megabytes to one place, half up, with an Indonesian decimal comma: 3146283 → "3,1 MB".
// Rounded in whole tenths, since toFixed rounds 0.95 down.
export const formatMb = (bytes) => {
  const tenths = Math.round(bytes / 100_000)
  return `${Math.floor(tenths / 10)},${tenths % 10} MB`
}

export const metaText = (bytes) => `${pageCount(bytes)} halaman · ${formatMb(bytes.length)}`

const linkPattern = (name) =>
  new RegExp(
    `(href="https://dl\\.zurupos\\.com/panduan/${name.replace(/\./g, '\\.')}"[^>]*>[^<]*<span class="guide-meta">)([^<]*)(</span>)`,
  )

// Returns the page with each guide's meta text replaced, and what it said before.
export const render = (html, metas) => {
  const changes = []
  let out = html
  for (const [name, text] of Object.entries(metas)) {
    const pattern = linkPattern(name)
    const match = out.match(pattern)
    if (!match) throw new Error(`no download link for ${name} in panduan/index.html`)
    if (match[2] !== text) changes.push({ name, from: match[2], to: text })
    out = out.replace(pattern, `$1${text}$3`)
  }
  return { html: out, changes }
}

export const currentMetas = () =>
  Object.fromEntries(guideNames.map((name) => [name, metaText(readFileSync(join(pdfDir, name)))]))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check')
  const { html, changes } = render(readFileSync(pagePath, 'utf8'), currentMetas())
  for (const c of changes) console.log(`${c.name}: "${c.from}" → "${c.to}"`)
  if (check) {
    if (changes.length) {
      console.error('panduan/index.html is out of date: run node apps/landing/scripts/guide-meta.mjs')
      process.exit(1)
    }
    console.log('panduan/index.html matches the guide PDFs')
  } else if (changes.length) {
    writeFileSync(pagePath, html)
  } else {
    console.log('panduan/index.html already matches the guide PDFs')
  }
}
