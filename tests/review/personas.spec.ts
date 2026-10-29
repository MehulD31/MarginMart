/* eslint-disable no-empty-pattern -- Playwright needs a fixtures object even when unused */
import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, fn, isPhone, login, rest, screenIsSound, token, watchErrors } from './helpers'

const ADMIN_PAGES = [
  ['dashboard', 'Next delivery', 'Today'], ['orders', 'Orders', 'Orders'], ['loading', 'Loading sheet', 'Loading'],
  ['shops', 'Shops'], ['catalog', 'Catalogue'], ['prices', 'Price lists'],
  ['network', 'Routes & vehicles'], ['users', 'Users'], ['join-requests', 'Join requests'],
] as const

async function goTo(page: Page, phone: boolean, label: string) {
  if (!phone) { await page.locator('.sidebar').getByRole('link', { name: label }).click(); return }
  const bottom = page.locator('.bottom-nav').getByRole('link', { name: label })
  if (await bottom.count()) { await bottom.click(); return }
  await page.locator('.bottom-nav').getByRole('button', { name: 'More' }).click()
  await page.getByRole('dialog').getByRole('link', { name: label }).click()
}

test.describe('Everyone', () => {
  test('login screen and join form are usable and clean', async ({ page }) => {
    const errors = watchErrors(page)
    await page.addInitScript(() => localStorage.setItem('lang', 'en'))
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log in' })).toBeDisabled()
    await screenIsSound(page, 'login')
    await page.getByRole('link', { name: 'Request to join' }).click()
    await expect(page.getByRole('heading', { name: 'Request to join' })).toBeVisible()
    await screenIsSound(page, 'join')
    expect(errors).toEqual([])
  })

  test('wrong PIN is refused with a clear message', async ({ page }) => {
    await login(page, ACCOUNTS.driver, '111222')
    await expect(page.getByRole('alert')).toContainText('Wrong number or PIN')
    await expect(page).toHaveURL(/\/login/)
  })

  test('Hindi toggle switches text and page language', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lang', 'en'))
    await page.goto('/login')
    await page.getByRole('button', { name: 'हिंदी में बदलें' }).click()
    await expect(page.getByRole('heading', { name: 'लॉग इन' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  })
})

test.describe('Admin', () => {
  test('reaches every admin page from the navigation, all clean', async ({ page }, info) => {
    const errors = watchErrors(page)
    await login(page, ACCOUNTS.admin)
    await expect(page).toHaveURL(/\/admin\/dashboard/)
    for (const [path, heading, navLabel] of ADMIN_PAGES as unknown as [string, string, string?][]) {
      const label = heading
      await goTo(page, isPhone(info), navLabel ?? heading)
      await expect(page).toHaveURL(new RegExp(`/admin/${path}`))
      if (path === 'dashboard') await expect(page.getByRole('region', { name: label })).toBeVisible()
      else await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible()
      await page.waitForLoadState('networkidle')
      await screenIsSound(page, `admin ${path}`)
    }
    expect(errors).toEqual([])
  })

  test('add-shop form blocks bad input', async ({ page }) => {
    await login(page, ACCOUNTS.admin)
    await page.goto('/admin/shops')
    await page.getByRole('button', { name: 'Add shop' }).first().click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Shop name *').fill('QA Temp Shop')
    await dlg.getByLabel('Mobile').fill('12345')
    await expect(dlg.getByText('Enter a valid 10-digit mobile number.')).toBeVisible()
    await expect(dlg.getByRole('button', { name: 'Save' })).toBeDisabled()
    await screenIsSound(page, 'add shop form')
    await page.keyboard.press('Escape')
    await expect(dlg).toBeHidden()
  })

  test('price list shows as Live and is locked from editing', async ({ page }) => {
    await login(page, ACCOUNTS.admin)
    await page.goto('/admin/prices')
    await expect(page.getByText('No price list is live yet')).toHaveCount(0)
    await expect(page.locator('.card').getByText('Live', { exact: true })).toBeVisible()
    await expect(page.locator('table input')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Copy as new draft' })).toBeVisible()
  })

  test('opens a pack and sees its flavours', async ({ page }) => {
    await login(page, ACCOUNTS.admin)
    await page.goto('/admin/catalog')
    await page.getByRole('button', { name: /300ml Can/ }).click()
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByRole('heading', { name: '300ml Can' })).toBeVisible()
    await expect(dlg.locator('.variant')).toHaveCount(5)
    await screenIsSound(page, 'pack sheet')
  })
})

test.describe('Manager', () => {
  test('can work with shops but cannot change prices or catalogue', async ({ page }) => {
    const errors = watchErrors(page)
    await login(page, ACCOUNTS.manager)
    await expect(page).toHaveURL(/\/admin\/dashboard/)
    await page.goto('/admin/shops')
    await expect(page.getByRole('button', { name: 'Add shop' }).first()).toBeVisible()
    await page.goto('/admin/catalog')
    await expect(page.getByText('Only admins can edit the catalogue.')).toBeVisible()
    await page.goto('/admin/prices')
    await expect(page.getByRole('heading', { level: 1, name: 'Price lists' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Make live' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Import PepsiCo sheet' })).toHaveCount(0)
    await expect(page.locator('table input')).toHaveCount(0)
    await page.goto('/admin/users')
    await page.getByRole('button', { name: 'Add user' }).click()
    await expect(page.getByRole('dialog')).toContainText('Shop logins are created from the Shops page')
    expect(errors).toEqual([])
  })

  test('server refuses staff creation by a manager', async ({}, info) => {
    test.skip(isPhone(info), 'API check runs once')
    const tok = await token(ACCOUNTS.manager)
    const r = await fn(tok, 'admin-users', { action: 'create', role: 'admin', name: 'Sneaky', phone: '9000000199' })
    expect(r.status).toBe(403)
    const pl = await rest(tok, 'price_list_item?id=not.is.null&select=id', { method: 'PATCH', body: JSON.stringify({ trade_price_paise: 1 }) })
    expect(pl.body).toEqual([])
  })
})

test.describe('Shop owner', () => {
  test('first login forces a new PIN and refuses a mismatched confirm', async ({ page }) => {
    await login(page, ACCOUNTS.newShop)
    await expect(page.getByRole('heading', { name: 'Set your new PIN' })).toBeVisible()
    await page.getByLabel('New PIN', { exact: true }).fill('123456')
    await page.getByLabel('Confirm new PIN').fill('654321')
    await page.getByRole('button', { name: 'Save PIN' }).click()
    await expect(page.getByRole('alert')).toContainText("don't match")
    await screenIsSound(page, 'change pin')
  })

  test('lands on the shop home, cannot open admin, can log out', async ({ page }) => {
    const errors = watchErrors(page)
    await login(page, ACCOUNTS.shop)
    await expect(page).toHaveURL(/\/shop/)
    await expect(page.getByText('Next delivery')).toBeVisible()
    await page.getByRole('link', { name: 'Account' }).click()
    await expect(page.getByText('QA Owner')).toBeVisible()
    await screenIsSound(page, 'shop home')
    await page.goto('/admin/shops')
    await expect(page).toHaveURL(/\/shop/)
    await page.getByRole('link', { name: 'Account' }).click()
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login/)
    expect(errors).toEqual([])
  })

  test('database refuses other shops, draft prices and self credit edits', async ({}, info) => {
    test.skip(isPhone(info), 'API check runs once')
    const tok = await token(ACCOUNTS.shop)
    const shops = await rest(tok, 'shop?select=name')
    expect(shops.body.map((s: { name: string }) => s.name)).toEqual(['QA Shop One'])
    const lists = (await rest(tok, 'price_list?select=status')).body
    expect(lists.every((l: { status: string }) => l.status === 'active'), 'shop sees only the live price list').toBe(true)
    expect((await rest(tok, 'profiles?select=phone')).body).toHaveLength(1)
    const edit = await rest(tok, 'shop?name=eq.QA%20Shop%20One', { method: 'PATCH', body: JSON.stringify({ credit_limit_paise: 99999999 }) })
    expect(edit.body).toEqual([])
  })
})

test.describe('Driver', () => {
  test('lands on the driver home and cannot open admin', async ({ page }) => {
    const errors = watchErrors(page)
    await login(page, ACCOUNTS.driver)
    await expect(page).toHaveURL(/\/driver/)
    await screenIsSound(page, 'driver home')
    await page.goto('/admin/users')
    await expect(page).toHaveURL(/\/driver/)
    expect(errors).toEqual([])
  })

  test('cannot read shops or other users through the API', async ({}, info) => {
    test.skip(isPhone(info), 'API check runs once')
    const tok = await token(ACCOUNTS.driver)
    expect((await rest(tok, 'shop?select=id')).body).toEqual([])
    expect((await rest(tok, 'profiles?select=phone')).body).toHaveLength(1)
  })
})

test.describe('Helper', () => {
  test('there is no helper role that could log in', async ({}, info) => {
    test.skip(isPhone(info), 'API check runs once')
    const tok = await token(ACCOUNTS.admin)
    const r = await fn(tok, 'admin-users', { action: 'create', role: 'helper', name: 'Helper', phone: '9000000198' })
    expect(r.status).toBe(400)
  })
})

test.describe('PIN visibility (owner decision)', () => {
  test('admin can see a PIN; manager cannot', async ({ page }) => {
    await login(page, ACCOUNTS.admin)
    await page.goto('/admin/users')
    await page.locator('tr', { hasText: 'QA Driver' }).getByRole('button', { name: 'Show PIN' }).click()
    await expect(page.getByRole('dialog')).toContainText('482915')
    await page.getByRole('button', { name: "Done, I've shared them" }).click()
  })
  test('manager has no Show PIN button', async ({ page }) => {
    await login(page, ACCOUNTS.manager)
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show PIN' })).toHaveCount(0)
  })
})
