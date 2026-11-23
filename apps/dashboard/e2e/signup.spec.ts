// A new owner registers the shop from the login page and lands on Home, with the setup checklist.
// The first try uses a weak PIN and must say why it failed.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('owner registers a shop in the dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Belum punya akun? Daftarkan toko' }).click()
  await page.getByLabel('Nama toko').fill('Kopi Daftar E2E')
  await page.getByLabel('Nama Anda').fill('Dina')
  await page.getByLabel('Email').fill(`e2e-signup-${randomUUID().slice(0, 8)}@test.zurupos.local`)
  await page.getByLabel('Kata sandi').fill('kopi-susu-aren-2026')
  // A weak PIN is rejected by the API with a specific message, not a generic one.
  await page.getByLabel('PIN').fill('1234')
  await page.getByRole('button', { name: 'Daftar' }).click()
  // Scoped to the toast region: the screen-reader announcement repeats the text.
  await expect(
    page
      .getByRole('region', { name: /Notifikasi/ })
      .getByText('PIN terlalu mudah ditebak.', { exact: false }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/signup$/)
  await page.getByLabel('PIN').fill('2580')
  await page.getByRole('button', { name: 'Daftar' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('setup-checklist')).toContainText('Siapkan toko Anda')
  await expect(page.getByText('Kopi Daftar E2E').first()).toBeVisible()
})

test('a wrong password says so on the login page', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(`e2e-nobody-${randomUUID().slice(0, 8)}@test.zurupos.local`)
  await page.getByLabel('Kata sandi').fill('bukan-kata-sandi-2026')
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(
    page.getByRole('region', { name: /Notifikasi/ }).getByText('Email atau kata sandi salah.'),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})
