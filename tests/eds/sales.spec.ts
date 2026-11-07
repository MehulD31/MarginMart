// Admin "Counter sales" page against the live database. Needs at least two counter-sale bills dated today
// (the Telegram harness scratch/telegram/sale-e2e.mjs creates them); it voids one through the UI.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  return errors
}
async function login(page: Page, phone: string, pin: string) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByLabel('4-digit PIN').fill(pin)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}
const rupees = (s: string) => Number(s.replace(/[^\d.]/g, ''))

test('Admin: Counter sales page lists bills, totals add up, void works, empty + bad range handled', async ({ page }) => {
  expect(env.VITE_SUPABASE_URL).toBeTruthy()
  const errors = watchErrors(page)
  await login(page, '8871565551', '1234')
  await page.goto('/admin/sales')
  await expect(page.getByRole('heading', { name: 'Counter sales' })).toBeVisible()
  const cards = page.getByTestId('sale-card')
  await expect(cards.first()).toBeVisible({ timeout: 20_000 })
  const n = await cards.count()
  expect(n).toBeGreaterThanOrEqual(2)

  // Totals = sum of the bills that are not cancelled.
  const live = cards.filter({ hasNot: page.getByText('Cancelled', { exact: true }) })
  const liveCount = await live.count()
  await expect(page.locator('.stat', { hasText: 'Bills' }).locator('.value')).toHaveText(String(liveCount))
  let sum = 0
  for (let i = 0; i < liveCount; i++) sum += rupees((await live.nth(i).locator('strong.num').first().textContent()) ?? '0')
  expect(rupees((await page.locator('.stat', { hasText: 'Sales' }).locator('.value').textContent()) ?? '0')).toBe(sum)
  await expect(page.locator('.stat', { hasText: 'Margin' })).toBeVisible()

  // A bill shows its shop, time, payer, lines.
  const first = live.first()
  await expect(first).toContainText(/KD-\d{5}/)
  await expect(first).toContainText(/Cash|UPI/)
  await expect(first).toContainText(/\d+ × ₹[\d,]+ = ₹[\d,]+/)

  // Void through the UI: needs a reason, then shows Cancelled and totals drop.
  const target = live.first()
  const number = (await target.textContent())!.match(/KD-\d{5}/)![0]
  await target.getByRole('button', { name: 'Cancel bill' }).click()
  const submit = page.getByRole('dialog').getByRole('button', { name: 'Cancel bill' })
  await expect(submit).toBeDisabled()
  await page.getByRole('dialog').getByLabel(/Reason/).fill('x')
  await expect(submit).toBeDisabled()
  await page.getByRole('dialog').getByLabel(/Reason/).fill('QA test cancel')
  await submit.click()
  const card = cards.filter({ hasText: number })
  await expect(card).toContainText('Cancelled', { timeout: 15_000 })
  await expect(card).toContainText('QA test cancel')
  await expect(card.getByRole('button', { name: 'Cancel bill' })).toHaveCount(0)
  await expect(page.locator('.stat', { hasText: 'Bills' }).locator('.value')).toHaveText(String(liveCount - 1))

  // Bad range and empty range.
  await page.getByLabel('From', { exact: true }).fill('2030-01-02')
  await page.getByLabel('To', { exact: true }).fill('2030-01-01')
  await expect(page.getByText('The start date must not be after the end date.')).toBeVisible()
  await page.getByLabel('From', { exact: true }).fill('2020-01-01')
  await page.getByLabel('To', { exact: true }).fill('2020-01-02')
  await expect(page.getByText('No counter sales in these dates')).toBeVisible()
  await expect(page.locator('.stat', { hasText: 'Bills' }).locator('.value')).toHaveText('0')

  // Reachable from the menu, and in Hindi.
  await page.goto('/admin/dashboard')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  if (page.viewportSize()!.width < 900) await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Counter sales' }).first().click()
  await expect(page).toHaveURL(/\/admin\/sales/)
  await page.getByRole('button', { name: /हिंदी/ }).first().click()
  await expect(page.getByRole('heading', { name: 'काउंटर बिक्री' })).toBeVisible()
  expect(errors).toEqual([])
})
