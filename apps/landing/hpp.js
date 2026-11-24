// HPP calculator page (D-060): wires the form to hpp-math.js. User text only
// ever goes into input values and textContent, never into HTML.
import { calculate, formatPercent, formatRupiah, parseRupiah } from './hpp-math.js'

const STORAGE_KEY = 'zuru-hpp-v1'

const EXAMPLE = {
  menu: 'Kopi Susu Gula Aren',
  sell: '22.000',
  target: '30',
  ingredients: [
    { name: 'Kopi bubuk', price: '150.000', pack: '1.000', unit: 'g', use: '18' },
    { name: 'Susu UHT', price: '20.000', pack: '1.000', unit: 'ml', use: '150' },
    { name: 'Gula aren cair', price: '40.000', pack: '1.000', unit: 'ml', use: '25' },
    { name: 'Es batu', price: '10.000', pack: '5.000', unit: 'g', use: '150' },
    { name: 'Cup, tutup, sedotan', price: '60.000', pack: '50', unit: 'pcs', use: '1' },
  ],
}

const EMPTY_ROW = { name: '', price: '', pack: '', unit: 'g', use: '' }

// Browser storage is a convenience only; the page works without it.
const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved && Array.isArray(saved.ingredients)) return saved
  } catch {
    // private window, blocked storage or bad JSON: start from the example
  }
  return structuredClone(EXAMPLE)
}

const save = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

const init = () => {
  const form = document.getElementById('hpp-form')
  const list = document.getElementById('ingredient-list')
  const template = document.getElementById('row-template')
  if (!form || !list || !template) return
  const out = (id) => document.getElementById(id)

  const readState = () => ({
    menu: form.elements.menu.value,
    sell: form.elements.sell.value,
    target: form.elements.target.value,
    ingredients: [...list.children].map((li) => {
      const v = (k) => li.querySelector(`[data-k="${k}"]`).value
      return { name: v('name'), price: v('price'), pack: v('pack'), unit: v('unit'), use: v('use') }
    }),
  })

  const addRow = (row, focus = false) => {
    const li = template.content.firstElementChild.cloneNode(true)
    for (const k of ['name', 'price', 'pack', 'unit', 'use']) {
      li.querySelector(`[data-k="${k}"]`).value = row[k] ?? ''
    }
    list.append(li)
    if (focus) li.querySelector('[data-k="name"]').focus()
  }

  const fill = (state) => {
    form.elements.menu.value = state.menu ?? ''
    form.elements.sell.value = state.sell ?? ''
    form.elements.target.value = state.target ?? ''
    list.replaceChildren()
    for (const row of state.ingredients) addRow(row)
  }

  const render = () => {
    const state = readState()
    const r = calculate({
      ingredients: state.ingredients,
      sellPrice: state.sell,
      targetPercent: state.target,
    })
    const typed = (el) => el.value.trim() !== ''
    ;[...list.children].forEach((li, i) => {
      const row = r.rows[i]
      for (const k of ['price', 'pack', 'use']) {
        const input = li.querySelector(`[data-k="${k}"]`)
        // Only flag a field once something is in it, so a new row isn't all red.
        input.setAttribute('aria-invalid', String(row.errors[k] && typed(input)))
      }
      li.querySelector('[data-k="cost"]').textContent = row.cost === null ? '–' : formatRupiah(row.cost)
      li.querySelector('[data-k="remove"]').hidden = list.children.length === 1
    })
    form.elements.target.setAttribute(
      'aria-invalid',
      String(r.targetBp === null && typed(form.elements.target)),
    )
    form.elements.sell.setAttribute('aria-invalid', String(r.sell === null && typed(form.elements.sell)))

    out('r-menu').textContent = state.menu.trim() ? `· ${state.menu.trim()}` : ''
    out('r-hpp').textContent = r.hpp === null ? '–' : formatRupiah(r.hpp)
    out('r-share').textContent = r.hppBp === null ? '–' : formatPercent(r.hppBp)
    out('r-profit').textContent = r.profit === null ? '–' : formatRupiah(r.profit)
    out('r-target').textContent = r.targetBp === null ? '' : formatPercent(r.targetBp)
    out('r-suggested').textContent = r.suggested === null ? '–' : formatRupiah(r.suggested)
    out('r-profit').classList.toggle('is-negative', r.profit !== null && r.profit < 0n)
    out('r-note').textContent =
      r.hpp === null
        ? 'Lengkapi harga beli, isi kemasan, dan takaran tiap bahan.'
        : 'Harga saran dibulatkan ke atas ke Rp 500.'
    out('bar-hpp').textContent = out('r-hpp').textContent
    out('bar-share').textContent = r.hppBp === null ? '' : `(${formatPercent(r.hppBp)})`
    save(state)
  }

  // Show the bar while the result card is off screen (CSS hides it on wide screens).
  const bar = document.getElementById('hpp-bar')
  const card = document.querySelector('.hpp-result')
  if (bar && card && 'IntersectionObserver' in window) {
    bar.hidden = false
    new IntersectionObserver(([e]) => bar.classList.toggle('is-shown', !e.isIntersecting)).observe(card)
  }

  // Show prices with thousands dots once the field is left: 150000 -> 150.000.
  const tidyRupiah = (input) => {
    const n = parseRupiah(input.value)
    if (n !== null) input.value = formatRupiah(n).replace('Rp ', '')
  }

  form.addEventListener('input', render)
  form.addEventListener('change', render)
  form.addEventListener('submit', (e) => e.preventDefault())
  form.addEventListener('focusout', (e) => {
    const t = e.target
    if (t.name === 'sell' || t.dataset?.k === 'price') {
      tidyRupiah(t)
      render()
    }
  })
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-k="remove"]')
    if (!btn) return
    const li = btn.closest('li')
    const next = li.nextElementSibling ?? li.previousElementSibling
    li.remove()
    next?.querySelector('[data-k="name"]').focus()
    render()
  })
  document.getElementById('add-row').addEventListener('click', () => {
    addRow(EMPTY_ROW, true)
    render()
  })
  document.getElementById('reset').addEventListener('click', () => {
    fill(structuredClone(EXAMPLE))
    render()
  })

  fill(load())
  render()
}

init()
