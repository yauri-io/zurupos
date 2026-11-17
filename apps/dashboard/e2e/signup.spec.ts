// A new owner registers the shop from the login page and lands on settings.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

test('owner registers a shop in the dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Belum punya akun? Daftarkan toko' }).click()
  await page.getByLabel('Nama toko').fill('Kopi Daftar E2E')
  await page.getByLabel('Nama Anda').fill('Dina')
  await page.getByLabel('Email').fill(`e2e-signup-${randomUUID().slice(0, 8)}@test.zurupos.local`)
  await page.getByLabel('Kata sandi').fill('kopi-susu-aren-2026')
  await page.getByLabel('PIN').fill('2580')
  await page.getByRole('button', { name: 'Daftar' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByText('Kopi Daftar E2E').first()).toBeVisible()
})
