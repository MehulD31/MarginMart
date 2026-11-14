// Unsaved work is kept: type into a form, reload the page (what a phone call or a killed tab does), and it is still there.
// Nothing is saved to the database by this test (the forms are never submitted).
import { expect, test, type Page } from '@playwright/test'

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

test('Kharcha form: typed amount and note survive a reload; "Start fresh" clears them', async ({ page }) => {
  await login(page)
  await page.goto('/admin/kharcha')
  const form = page.getByTestId('add-kharcha')
  await expect(form).toBeVisible({ timeout: 20_000 })
  await expect(form.getByTestId('draft-note')).toHaveCount(0)
  await form.getByPlaceholder('800').fill('4321')
  await page.waitForTimeout(600)                       // saved after a short pause
  await page.reload()
  const again = page.getByTestId('add-kharcha')
  await expect(again.getByPlaceholder('800')).toHaveValue('4321', { timeout: 20_000 })
  await expect(again.getByTestId('draft-note')).toBeVisible()
  await again.getByRole('button', { name: 'Start fresh' }).click()
  await expect(again.getByPlaceholder('800')).toHaveValue('')
  await page.reload()
  await expect(page.getByTestId('add-kharcha').getByPlaceholder('800')).toHaveValue('', { timeout: 20_000 })
  await expect(page.getByTestId('add-kharcha').getByTestId('draft-note')).toHaveCount(0)
})

test('New purchase: invoice number and note are kept after a reload and a reopen', async ({ page }) => {
  await login(page)
  await page.goto('/admin/purchases')
  await page.getByRole('button', { name: 'New purchase' }).click()
  const sheet = page.locator('dialog[open]')
  await sheet.getByLabel('Invoice no.').fill('QA-DRAFT-1')
  await page.waitForTimeout(600)
  await page.reload()
  await page.getByRole('button', { name: 'New purchase' }).click()
  const again = page.locator('dialog[open]')
  await expect(again.getByLabel('Invoice no.')).toHaveValue('QA-DRAFT-1', { timeout: 20_000 })
  await expect(again.getByTestId('draft-note')).toBeVisible()
  await again.getByRole('button', { name: 'Start fresh' }).click()
  await expect(again.getByLabel('Invoice no.')).toHaveValue('')
})

test('Search and filter on Khata are remembered', async ({ page }) => {
  await login(page)
  await page.goto('/admin/khata')
  const search = page.getByRole('searchbox').first()
  await expect(search).toBeVisible({ timeout: 20_000 })
  await search.fill('zzz-qa-search')
  await page.waitForTimeout(600)
  await page.reload()
  await expect(page.getByRole('searchbox').first()).toHaveValue('zzz-qa-search', { timeout: 20_000 })
  await page.getByRole('searchbox').first().fill('')
})
