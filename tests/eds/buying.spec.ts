// "Who buys what": by shop, by item, shop detail with rates and bills, item detail with shops. Read only, live data.
import { expect, test, type Page } from '@playwright/test'
async function login(page: Page, phone = '8871565551', pin = '1234') {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByLabel('4-digit PIN').fill(pin)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}
for (const [who, phone, pin] of [['admin', '8871565551', '1234'], ['manager', '6000000001', '1234']] as const) {
  test(`Who buys what (${who})`, async ({ page }) => {
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await login(page, phone, pin)
    await page.goto('/admin/buying')
    await page.getByRole('tab', { name: '1 year' }).click()
    await expect(page.getByTestId('buy-shop').first()).toBeVisible({ timeout: 20_000 })
    const name = (await page.getByTestId('buy-shop').first().locator('.cell-title').innerText()).replace(/^\d+\.\s*/, '')
    await page.screenshot({ path: `scratch/buy-${who}-list-${test.info().project.name}.png` })
    await page.getByTestId('buy-shop').first().click()
    const d = page.getByTestId('buy-shop-detail')
    await expect(d).toContainText('Items bought', { timeout: 15_000 })
    await expect(d).toContainText('avg rate ₹')
    await expect(d).toContainText('Recent bills')
    await page.screenshot({ path: `scratch/buy-${who}-shop-${test.info().project.name}.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'By item' }).click()
    await expect(page.getByTestId('buy-item').first()).toBeVisible()
    await page.getByTestId('buy-item').first().click()
    await expect(page.getByTestId('buy-item-detail')).toContainText('Shops that buy this')
    await page.screenshot({ path: `scratch/buy-${who}-item-${test.info().project.name}.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'By shop' }).click()
    await page.getByRole('searchbox').fill(name.slice(0, 5))
    await expect(page.getByTestId('buy-shop').first()).toContainText(name.slice(0, 5), { ignoreCase: true })
    expect(errors).toEqual([])
  })
}
