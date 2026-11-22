// Owner feedback during the pilot menu setup (2026-11-23): coming back from an
// item keeps its category open, and an add-on group is put on many items at
// once from the add-ons page (D-054).
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

const API = process.env.API_URL ?? 'http://localhost:4000'
const ORIGIN = process.env.DASHBOARD_URL ?? 'http://localhost:3000'
const headers = { 'x-requested-with': 'zuru', origin: ORIGIN }

const owner = {
  shop_name: 'Kopi Setup E2E',
  name: 'Rani',
  email: `e2e-${randomUUID().slice(0, 8)}@test.zurupos.local`,
  password: 'kopi-susu-aren-2026',
  pin: '2580',
}

const post = async (page: Page, path: string, data: object) => {
  const res = await page.request.post(`${API}/v1${path}`, { headers, data })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()) as { id: string }
}

test('category stays open after an item, and an add-on goes on many items at once', async ({ page }) => {
  const signup = await page.request.post(`${API}/v1/auth/signup`, { headers, data: owner })
  expect(signup.status(), await signup.text()).toBe(201)
  // Signing up through the page's request context leaves the owner logged in.
  await page.goto('/')
  await expect(page.getByText('Halo, Rani!')).toBeVisible()

  const kopi = await post(page, '/categories', { name: 'Kopi', sort: 0 })
  const teh = await post(page, '/categories', { name: 'Teh', sort: 1 })
  const latte = await post(page, '/items', { category_id: kopi.id, name: 'Latte', price: 25000 })
  const mocha = await post(page, '/items', { category_id: kopi.id, name: 'Mocha', price: 27000 })
  const tehTarik = await post(page, '/items', { category_id: teh.id, name: 'Teh Tarik', price: 15000 })
  const topping = await post(page, '/modifier-groups', {
    name: 'Topping',
    selection: 'multiple',
    max_select: 3,
  })

  // 1. Open "Teh", go into an item, come back: "Teh" is still open.
  await page.goto('/menu')
  await page.getByTestId('categories').getByRole('button', { name: /^Teh/ }).click()
  await expect(page).toHaveURL(new RegExp(`category=${teh.id}`))
  await page.getByRole('link', { name: 'Teh Tarik' }).click()
  await expect(page).toHaveURL(new RegExp(`/menu/items/${tehTarik.id}`))
  await page.getByTestId('back-to-menu').click()
  await expect(page.getByRole('heading', { name: 'Teh', exact: true })).toBeVisible()
  await expect(page.getByTestId('items').getByText('Teh Tarik')).toBeVisible()
  // A reload and the sidebar's Menu link keep it too.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Teh', exact: true })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Beranda' }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Menu', exact: true }).click()
  await expect(page.getByTestId('items').getByText('Teh Tarik')).toBeVisible()

  // 2. Put "Topping" on every coffee at once, then swap Mocha for Teh Tarik.
  await page.goto('/menu/modifiers')
  const card = page
    .getByTestId('groups')
    .locator('> div')
    .filter({ has: page.getByRole('heading', { name: 'Topping' }) })
  await expect(card.getByTestId('used-on')).toHaveText('Belum dipakai di menu mana pun')
  await card.getByTestId('use-on-items').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('checkbox', { name: 'Kopi · Semua' }).click()
  await expect(dialog.getByText('2 menu dipilih')).toBeVisible()
  await dialog.getByTestId('save-group-items').click()
  await expect(dialog).toHaveCount(0)
  await expect(card.getByTestId('used-on')).toHaveText('Dipakai di 2 menu')

  await card.getByTestId('use-on-items').click()
  await expect(dialog.getByRole('checkbox', { name: 'Latte' })).toBeChecked()
  await dialog.getByRole('checkbox', { name: 'Mocha' }).click()
  await dialog.getByRole('checkbox', { name: 'Teh Tarik' }).click()
  await dialog.getByTestId('save-group-items').click()
  await expect(dialog).toHaveCount(0)
  await expect(card.getByTestId('used-on')).toHaveText('Dipakai di 2 menu')

  const groupsOf = async (id: string) =>
    (
      (await (await page.request.get(`${API}/v1/items/${id}`, { headers })).json()) as {
        modifier_group_ids: string[]
      }
    ).modifier_group_ids
  expect(await groupsOf(latte.id)).toEqual([topping.id])
  expect(await groupsOf(mocha.id)).toEqual([])
  expect(await groupsOf(tehTarik.id)).toEqual([topping.id])
})
