// Long lists are paged (25 per page) instead of one endless scroll. Read-only.
import { expect, test, type Page } from '@playwright/test'

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

test('Change history and Users are paged; next page shows different rows', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await login(page)
  for (const path of ['/admin/audit', '/admin/users']) {
    await page.goto(path)
    const pager = page.getByRole('navigation', { name: 'Pages' })
    await expect(pager).toBeVisible({ timeout: 20_000 })
    await expect(pager).toContainText(/^1–25 of \d+/)
    await expect(page.locator('tbody tr')).toHaveCount(25)
    const first = await page.locator('tbody tr').first().innerText()
    await pager.getByRole('button', { name: 'Next page' }).click()
    await expect(pager).toContainText(/^26–\d+ of \d+/)
    expect(await page.locator('tbody tr').first().innerText()).not.toBe(first)
  }
  expect(errors).toEqual([])
})

test('Dashboard: "Call these shops" is searchable and paged 20 at a time', async ({ page }) => {
  await login(page)
  await page.goto('/admin/dashboard')
  const box = page.getByTestId('call-shops')
  if (!(await box.count())) { await expect(page.getByRole('heading', { name: /Call these shops/ })).toHaveCount(0); return }
  await expect(box.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })
  expect(await box.locator('tbody tr').count()).toBeLessThanOrEqual(20)
  const pager = box.getByRole('navigation', { name: 'Pages' })
  if (await pager.count()) await expect(pager).toContainText(/^1–20 of \d+/)
  const name = (await box.locator('tbody tr .cell-title').first().innerText()).trim()
  await box.getByRole('searchbox').fill(name)
  await expect(box.locator('tbody tr .cell-title').first()).toHaveText(name)
})