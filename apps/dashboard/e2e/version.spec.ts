// D-057: the build version is shown, and an open tab offers a reload once the
// server runs another build.
import { expect, test } from '@playwright/test'

test('shows the version and offers a reload after a deploy', async ({ page }) => {
  await page.goto('/login')
  const shown = await page.getByTestId('app-version').textContent()
  expect(shown).toMatch(/^Versi \S+$/)

  // Pretend the server was updated, then bring the tab back into view.
  await page.route('**/_version', (route) => route.fulfill({ json: { version: '2099.01.01-0000000' } }))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  const toast = page.getByRole('region', { name: /Notifikasi/ })
  await expect(toast.getByText('Versi baru tersedia')).toBeVisible()

  await page.unroute('**/_version')
  await toast.getByRole('button', { name: 'Muat ulang' }).click()
  await expect(page.getByTestId('app-version')).toHaveText(shown ?? '')
  await expect(toast.getByText('Versi baru tersedia')).toHaveCount(0)
})
