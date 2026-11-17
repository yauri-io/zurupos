// M2 exit criterion: an owner builds the demo menu in the dashboard, and the recipe
// preview shows the right deductions for Large + Oat + Extra shot (SPEC §7.1, UAT #3).
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

const API = process.env.API_URL ?? 'http://localhost:4000'
const ORIGIN = process.env.DASHBOARD_URL ?? 'http://localhost:3000'

const owner = {
  shop_name: 'Kopi Demo E2E',
  name: 'Dina',
  email: `e2e-${randomUUID().slice(0, 8)}@test.zurupos.local`,
  password: 'kopi-susu-aren-2026',
  pin: '2580',
}

const modal = (page: Page) => page.getByRole('dialog')

const pick = async (page: Page, trigger: ReturnType<Page['locator']>, label: string) => {
  await trigger.click()
  // A closing dropdown can linger in the DOM for a moment; pick from the open one.
  await page.getByRole('listbox').last().getByRole('option', { name: label, exact: true }).click()
}

test('owner builds the demo menu and previews ingredient usage', async ({ page, request }) => {
  const signup = await request.post(`${API}/v1/auth/signup`, {
    headers: { 'x-requested-with': 'zuru', origin: ORIGIN },
    data: owner,
  })
  expect(signup.status(), await signup.text()).toBe(201)

  await page.goto('/login')
  await page.getByLabel('Email').fill(owner.email)
  await page.getByLabel('Kata sandi').fill(owner.password)
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByText('Halo, Dina!')).toBeVisible()

  // Ingredients
  await page.goto('/ingredients')
  for (const [name, unit] of [
    ['Biji Kopi', 'gram (g)'],
    ['Susu Segar', 'mililiter (ml)'],
    ['Susu Oat', 'mililiter (ml)'],
    ['Gula Aren', 'mililiter (ml)'],
    ['Cup 12oz', 'buah (pcs)'],
    ['Cup 16oz', 'buah (pcs)'],
    ['Tutup', 'buah (pcs)'],
  ] as const) {
    await page.getByRole('button', { name: 'Tambah bahan' }).first().click()
    await modal(page).getByLabel('Nama').fill(name)
    await pick(page, modal(page).getByRole('combobox').first(), unit)
    await modal(page).getByRole('button', { name: 'Simpan' }).click()
    await expect(page.getByTestId('ingredients').getByText(name, { exact: true })).toBeVisible()
  }

  // Category + item
  await page.goto('/menu')
  await page.getByRole('button', { name: 'Tambah kategori' }).first().click()
  await modal(page).getByLabel('Nama').fill('Kopi')
  await modal(page).getByRole('button', { name: 'Simpan' }).click()
  await page.getByRole('button', { name: 'Tambah menu' }).click()
  await modal(page).getByLabel('Nama').fill('Kopi Susu Gula Aren')
  await modal(page).getByLabel('Harga').fill('25.000')
  await modal(page).getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByTestId('items').getByText('Rp 25.000')).toBeVisible()

  // Modifier groups, options and effects
  await page.goto('/menu/modifiers')
  const addGroup = async (name: string, multiple = false) => {
    await page.getByRole('button', { name: 'Tambah grup' }).first().click()
    await modal(page).getByLabel('Nama').fill(name)
    if (multiple) {
      await modal(page).getByLabel('Boleh lebih dari satu').check()
      await modal(page).getByLabel('Maksimal dipilih').fill('3')
    }
    await modal(page).getByRole('button', { name: 'Simpan' }).click()
    await expect(page.getByRole('heading', { name })).toBeVisible()
  }
  const card = (group: string) =>
    page
      .getByTestId('groups')
      .locator('> div')
      .filter({ has: page.getByRole('heading', { name: group }) })
  const addOption = async (group: string, name: string, price?: string) => {
    await card(group).getByRole('button', { name: 'Tambah opsi' }).click()
    await modal(page).getByLabel('Nama').fill(name)
    if (price) await modal(page).getByLabel('Tambahan harga').fill(price)
    await modal(page).getByRole('button', { name: 'Simpan' }).click()
    await expect(card(group).getByText(name, { exact: true })).toBeVisible()
  }
  type Effect = { kind: 'Tambah bahan' | 'Ganti bahan'; from?: string; to: string; qty?: string }
  const setEffects = async (group: string, option: string, effects: Effect[]) => {
    const row = card(group).locator('div.flex', { hasText: option }).last()
    await row.getByRole('button', { name: 'Efek bahan' }).click()
    for (const [index, e] of effects.entries()) {
      await modal(page).getByRole('button', { name: 'Tambah efek' }).click()
      const line = modal(page).getByTestId('effects').locator('> div.flex').nth(index)
      await pick(page, line.getByRole('combobox').first(), e.kind)
      // Ingredient pickers are buttons labelled by their placeholder.
      if (e.from) {
        await pick(page, line.getByRole('button', { name: 'Bahan diganti' }), e.from)
        await pick(page, line.getByRole('button', { name: 'Diganti dengan' }), e.to)
      } else {
        await pick(page, line.getByRole('button', { name: 'Pilih bahan' }), e.to)
      }
      if (e.qty) await line.getByRole('textbox').last().fill(e.qty)
    }
    await modal(page).getByRole('button', { name: 'Simpan' }).click()
    await expect(modal(page)).toHaveCount(0)
  }

  await addGroup('Ukuran')
  await addOption('Ukuran', 'Regular')
  await addOption('Ukuran', 'Large', '5.000')
  await setEffects('Ukuran', 'Large', [
    { kind: 'Ganti bahan', from: 'Cup 12oz', to: 'Cup 16oz' },
    { kind: 'Tambah bahan', to: 'Susu Segar', qty: '50' },
  ])
  await addGroup('Susu')
  await addOption('Susu', 'Oat', '6.000')
  await setEffects('Susu', 'Oat', [{ kind: 'Ganti bahan', from: 'Susu Segar', to: 'Susu Oat' }])
  await addGroup('Tambahan', true)
  await addOption('Tambahan', 'Extra shot', '5.000')
  await setEffects('Tambahan', 'Extra shot', [{ kind: 'Tambah bahan', to: 'Biji Kopi', qty: '18' }])

  // Item: recipe, attached groups, preview
  await page.goto('/menu')
  await page.getByRole('link', { name: 'Kopi Susu Gula Aren' }).click()
  const recipe = page.getByTestId('recipe')
  for (const [index, [name, qty]] of [
    ['Biji Kopi', '18'],
    ['Susu Segar', '150'],
    ['Gula Aren', '20'],
    ['Cup 12oz', '1'],
    ['Tutup', '1'],
  ].entries()) {
    await recipe.getByRole('button', { name: 'Tambah bahan' }).click()
    const line = recipe.locator('> div.flex.gap-2.items-start').nth(index)
    await pick(page, line.getByRole('button', { name: 'Pilih bahan' }), name ?? '')
    await line.getByRole('textbox').fill(qty ?? '')
  }
  await recipe.getByRole('button', { name: 'Simpan resep' }).click()
  await expect(page.getByText('Tersimpan').first()).toBeVisible()

  const groups = page.getByTestId('item-groups')
  for (const name of ['Ukuran', 'Susu', 'Tambahan']) {
    await pick(page, groups.getByRole('button', { name: 'Tambah grup…' }), name)
  }
  await groups.getByRole('button', { name: 'Simpan' }).click()
  await expect(page.getByText('Large (+Rp 5.000)')).toBeVisible()

  for (const option of ['Large (+Rp 5.000)', 'Oat (+Rp 6.000)', 'Extra shot (+Rp 5.000)']) {
    await page.getByLabel(option).check()
  }
  const preview = page.getByTestId('preview')
  await expect(preview.getByRole('row')).toHaveCount(5)
  for (const [name, amount] of [
    ['Biji Kopi', '36 g'],
    ['Susu Oat', '200 ml'],
    ['Gula Aren', '20 ml'],
    ['Cup 16oz', '1 pcs'],
    ['Tutup', '1 pcs'],
  ]) {
    await expect(preview.getByRole('row', { name: `${name} ${amount}` })).toBeVisible()
  }
})
