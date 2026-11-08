// Smart dashboard on the live database (read-only: it never writes anything).
// The AI call (/api/insights-ai, a Vercel function) is mocked here; its prompt is unit-tested and it is checked on the live site.
import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, lang = 'en') {
  await page.addInitScript((l) => localStorage.setItem('lang', l), lang)
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

test('Dashboard: KPIs, alerts, trend, call list, items, shops, growth, AI plan', async ({ page }, info) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  let sent: { facts?: { top_items?: unknown[] }; question?: string } = {}
  await page.route('**/api/insights-ai', async (r) => {
    sent = r.request().postDataJSON()
    await r.fulfill({ json: { text: sent.question ? '• Abhilash sabse zyada Sting leta hai.' : '• Paul Aqua ko call karo: 70 peti ka order.\n• Nimbooz 3 din me khatam, 117 peti mangao.' } })
  })
  await login(page)
  await page.goto('/admin/dashboard')

  const ai = page.getByTestId('ai-card')
  await expect(ai).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('ins-kpi').first()).toContainText('Sales today')
  await expect(page.getByText('Needs attention')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Daily sales chart' })).toBeVisible()

  await ai.getByRole('button', { name: "Today's plan" }).click()
  await expect(ai.getByText('Paul Aqua ko call karo', { exact: false })).toBeVisible()
  expect(sent.facts?.top_items?.length).toBeGreaterThan(0)
  await ai.getByRole('button', { name: 'Which items make me the most money?' }).click()
  await expect(ai.getByText('Abhilash sabse zyada Sting')).toBeVisible()
  expect(sent.question).toBe('Which items make me the most money?')

  await page.getByRole('tab', { name: /Items/ }).click()
  await expect(page.getByTestId('item-row').first()).toContainText('Sting')
  await expect(page.getByText('Suggested Pepsi order')).toBeVisible()

  await page.getByRole('tab', { name: /^Shops/ }).click()
  await expect(page.getByTestId('shop-row').first()).toContainText('Abhilash')
  await page.getByTestId('shop-row').first().click()
  const card = page.getByTestId('shop-card')
  await expect(card).toContainText('Usually buys')
  await expect(card.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa\.me\/91\d{10}\?text=/)
  await page.screenshot({ path: `scratch/ins-${info.project.name}-shop.png` })
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('tab', { name: /Growth/ }).click()
  await expect(page.getByText(/Only \d+ of \d+ shops/)).toBeVisible()
  await expect(page.getByTestId('prospect').first()).toBeVisible()

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `scratch/ins-${info.project.name}-top.png`, fullPage: true })
  // Hindi
  await page.getByRole('button', { name: /हिंदी/ }).first().click()
  await expect(page.getByText('AI सलाहकार')).toBeVisible()
  expect(errors).toEqual([])
})
