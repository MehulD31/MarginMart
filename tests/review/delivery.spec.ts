/* eslint-disable no-empty-pattern -- Playwright needs a fixtures object even when unused */
// M5 persona review: a driver runs a real route (partial delivery, van sale, cash, UPI, offline),
// the shop sees its khata, the manager collects, the admin corrects. Each run builds its own route for today.
import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, ANON, PIN, SUPABASE_URL, fn, login, rest, screenIsSound, token, watchErrors } from './helpers'

async function rpc(tok: string, name: string, args: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const run = { routeId: '', routeName: '', planId: '', shopA: '', shopB: '', shopAName: '', shopBName: '', shopPhone: '', variants: {} as Record<string, string> }

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({}, info) => {
  const tag = `${info.project.name}-${Date.now().toString(36)}`
  const admin = await token(ACCOUNTS.admin)
  const mgr = await token(ACCOUNTS.manager)
  const isoDow = ((new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getDay() + 6) % 7) + 1
  run.routeId = (await rest(admin, 'route', { method: 'POST', body: JSON.stringify({ name: `QA ${tag}`, visit_days: [isoDow] }) })).body[0].id
  run.routeName = `QA ${tag}`
  run.shopAName = `QA Stop A ${tag}`; run.shopBName = `QA Stop B ${tag}`
  run.shopPhone = `9${String(Date.now()).slice(-9)}`
  run.shopA = (await rest(admin, 'shop', { method: 'POST', body: JSON.stringify({ name: run.shopAName, route_id: run.routeId, stop_seq: 1, phone: run.shopPhone }) })).body[0].id
  run.shopB = (await rest(admin, 'shop', { method: 'POST', body: JSON.stringify({ name: run.shopBName, route_id: run.routeId, stop_seq: 2 }) })).body[0].id
  // Shop A gets a login with the standard QA PIN.
  const created = await fn(admin, 'admin-users', { action: 'create', role: 'shop', name: 'QA Stop Owner', phone: run.shopPhone, shop_id: run.shopA })
  const tmp = (await (await fetch(`${SUPABASE_URL}/functions/v1/pin-login`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: run.shopPhone, pin: created.body.pin }) })).json()).access_token
  await fn(tmp, 'admin-users', { action: 'change_pin', new_pin: PIN })

  for (const [k, fl] of [['pepsi', 'Pepsi'], ['dew', 'Mountain Dew'], ['mirinda', 'Mirinda']]) {
    run.variants[k] = (await rest(admin, `variant?select=id,pack!inner(name_en)&flavour_en=eq.${encodeURIComponent(fl)}&pack.name_en=eq.300ml%20Can`)).body[0].id
  }
  await rpc(mgr, 'save_order', { p_lines: [], p_shop_id: run.shopA }) // creates today's plan for the new route
  run.planId = (await rest(admin, `route_day_plan?select=id&route_id=eq.${run.routeId}&date=eq.${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}`)).body[0].id
  const order = await rpc(mgr, 'save_order', { p_shop_id: run.shopA, p_plan_id: run.planId, p_lines: [{ variant_id: run.variants.pepsi, qty: 3 }, { variant_id: run.variants.dew, qty: 2 }] })
  expect(order.body.total_paise).toBe(5 * 77500)
  const driver = (await rest(admin, 'profiles?select=user_id&phone=eq.9000000103')).body[0].user_id
  const vehicle = (await rest(admin, 'vehicle?select=id&name=eq.Vehicle%202')).body[0].id
  // Detach the QA driver from any older QA plans so today's route is the one they see.
  for (const p of (await rest(admin, `route_day_plan?select=id&driver_id=eq.${driver}&status=in.(loaded,out)`)).body) {
    await rest(admin, `route_day_plan?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ driver_id: null }) })
  }
  const lock = await rpc(mgr, 'lock_load', { p_plan_id: run.planId, p_vehicle_id: vehicle, p_driver_id: driver, p_spares: [{ variant_id: run.variants.mirinda, qty: 2 }] })
  expect(lock.status, JSON.stringify(lock.body)).toBe(204)
})

test.afterAll(async () => {
  const admin = await token(ACCOUNTS.admin)
  await rest(admin, `route_day_plan?id=eq.${run.planId}`, { method: 'PATCH', body: JSON.stringify({ driver_id: null }) })
  await rest(admin, `route?id=eq.${run.routeId}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })
})

async function openStop(page: Page, name: string) {
  await page.getByRole('link', { name: new RegExp(name) }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

test('Driver: sees the route, delivers short with a reason, adds a van sale, takes cash', async ({ page }) => {
  const errors = watchErrors(page)
  await login(page, ACCOUNTS.driver)
  await expect(page.getByRole('region', { name: "Today's route" })).toContainText('0 of 1 orders delivered')
  await expect(page.getByRole('button', { name: 'On the truck: 7 cases' })).toBeVisible()
  await screenIsSound(page, 'driver stops')

  await openStop(page, run.shopAName)
  await screenIsSound(page, 'driver stop')
  await page.getByRole('button', { name: 'One less Pepsi · 300ml Can' }).click()
  await expect(page.getByText('Choose a reason for every item delivered less than ordered.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Complete delivery/ })).toBeDisabled()
  await page.getByLabel('Why 1 less?').selectOption({ label: 'Not on truck' })
  await page.getByLabel('Add from the truck').selectOption({ label: 'Mirinda · 300ml Can (2 free)' })
  // 2 Pepsi + 2 Dew + 1 Mirinda = 5 × ₹775
  await page.getByLabel('Amount received (₹)').fill('3000')
  await expect(page.getByText('Shop owes after this')).toBeVisible()
  await expect(page.locator('.total-row')).toContainText('₹875')
  await page.getByRole('button', { name: 'Complete delivery · ₹3,875' }).click()

  const bill = page.getByRole('dialog', { name: 'Bill' })
  await expect(bill).toContainText('₹3,875')
  await expect(bill.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute('href', new RegExp(`wa\\.me/91${run.shopPhone}`))
  await bill.getByRole('button', { name: 'Next stop' }).click()
  await expect(page.getByRole('region', { name: "Today's route" })).toContainText('1 of 1 orders delivered', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.stat', { hasText: 'Cash' })).toContainText('₹3,000')
  expect(errors).toEqual([])
})

test('Driver: works offline at the next stop and syncs when the network returns', async ({ page, context }) => {
  await login(page, ACCOUNTS.driver)
  await expect(page.getByRole('region', { name: "Today's route" })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(500) // let the day's copy save to the phone
  await context.setOffline(true)
  await openStop(page, run.shopBName)
  await expect(page.getByText(/No order from this shop/)).toBeVisible()
  await page.getByLabel('Add from the truck').selectOption({ label: 'Mirinda · 300ml Can (1 free)' })
  await page.getByRole('radio', { name: 'UPI' }).check()
  await page.getByLabel(/UPI reference/).fill('QA-UPI-1')
  await page.getByRole('button', { name: 'Complete delivery · ₹775' }).click()
  await expect(page.getByRole('dialog', { name: 'Bill' })).toContainText('Bill number comes after sync')
  await page.getByRole('button', { name: 'Next stop' }).click()
  await expect(page.getByRole('button', { name: /^(Offline|1 to sync)/ })).toBeVisible()
  await expect(page.locator('.stop', { hasText: run.shopBName })).toContainText('Saved')
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.stop', { hasText: run.shopBName })).toContainText('Done', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'On the truck: 1 case' })).toBeVisible()
})

test('Database: delivery rules hold for drivers', async ({}, info) => {
  test.skip(info.project.name === 'phone', 'API checks run once')
  const drv = await token(ACCOUNTS.driver)
  const again = await rpc(drv, 'record_delivery', { p_action_id: crypto.randomUUID(), p_plan_id: run.planId, p_shop_id: run.shopA, p_lines: [] })
  expect(again.body.message).toBe('ALREADY_DELIVERED')
  const tooMuch = await rpc(drv, 'record_delivery', { p_action_id: crypto.randomUUID(), p_plan_id: run.planId, p_shop_id: run.shopB, p_lines: [{ variant_id: run.variants.pepsi, qty: 1 }] })
  expect(['ALREADY_DELIVERED', 'NOT_ON_TRUCK']).toContain(tooMuch.body.message)
  expect((await rpc(drv, 'void_ledger_entry', { p_entry_id: crypto.randomUUID(), p_reason: 'x' })).body.message).toBe('FORBIDDEN')
  const direct = await rest(drv, 'ledger_entry', { method: 'POST', body: JSON.stringify({ shop_id: run.shopA, type: 'payment', amount_paise: -1, payment_mode: 'cash' }) })
  expect(direct.status).toBeGreaterThanOrEqual(400)
  const shopTok = await token(run.shopPhone)
  expect((await rest(shopTok, 'ledger_entry?select=shop_id')).body.every((e: { shop_id: string }) => e.shop_id === run.shopA)).toBe(true)
  expect((await rpc(shopTok, 'record_payment', { p_action_id: crypto.randomUUID(), p_shop_id: run.shopA, p_mode: 'cash', p_amount_paise: 100 })).body.message).toBe('FORBIDDEN')
})

test('Shop owner: khata shows the bill, the payment and what is still due', async ({ page }) => {
  await login(page, run.shopPhone)
  await page.getByRole('link', { name: 'Khata' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Khata' })).toBeVisible()
  await expect(page.locator('.stat').filter({ has: page.locator('.label', { hasText: /^(Due|Advance)$/ }) })).toContainText('₹875')
  await expect(page.locator('.ledger')).toContainText('Bill')
  await expect(page.locator('.ledger')).toContainText('Paid · Cash')
  await page.locator('.pack-card').first().click()
  await expect(page.getByRole('dialog')).toContainText('Pepsi · 300ml Can × 2 (of 3)')
  await screenIsSound(page, 'shop khata')
})

test('Manager and admin: khata list, record a payment, correct an entry', async ({ page }) => {
  const errors = watchErrors(page)
  await login(page, ACCOUNTS.admin)
  await page.goto('/admin/khata')
  await page.getByRole('searchbox').fill(run.shopAName)
  const row = page.locator('tr', { hasText: run.shopAName })
  await expect(row).toContainText('₹875')
  await screenIsSound(page, 'admin khata')
  await row.getByRole('button', { name: 'Open' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Amount received (₹)').fill('500')
  await sheet.getByRole('button', { name: 'Save ₹500' }).click()
  await expect(sheet.getByText('Payment saved.')).toBeVisible()
  await expect(sheet.locator('.stat').filter({ has: page.locator('.label', { hasText: /^(Due|Advance)$/ }) })).toContainText('₹375')
  // Admin voids that ₹500 payment: a correction entry, the original stays visible.
  await sheet.locator('.ledger li', { hasText: 'Paid · Cash' }).filter({ hasText: '₹500' }).getByRole('button', { name: 'Void' }).click()
  const v = page.getByRole('dialog', { name: 'Void this entry?' })
  await v.getByLabel('Reason').fill('QA: entered twice')
  await v.getByRole('button', { name: 'Void' }).click()
  await expect(page.getByText('Entry voided.')).toBeVisible()
  await expect(sheet.locator('.stat').filter({ has: page.locator('.label', { hasText: /^(Due|Advance)$/ }) })).toContainText('₹875')
  await expect(sheet.locator('.ledger')).toContainText('Correction')
  expect(errors).toEqual([])
})

test('Driver: end of day is blocked while unsynced, and flags a missing case', async ({ page }) => {
  await login(page, ACCOUNTS.driver)
  await expect(page.getByRole('region', { name: "Today's route" })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('link', { name: 'End of day' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'End of day' })).toBeVisible()
  await screenIsSound(page, 'end of day')
  // 1 Pepsi should be left; the driver counts 0 (one went missing). Cash matches ₹3,000.
  const pepsi = page.locator('.deliver-line', { hasText: 'Pepsi · 300ml Can' })
  await expect(pepsi).toContainText('should be 1')
  await pepsi.getByRole('button', { name: 'One less Pepsi · 300ml Can' }).click()
  await expect(page.getByLabel('Cash you are handing over (₹)')).toHaveValue('3000')
  await page.getByRole('button', { name: 'Close the day' }).click()
  await page.getByRole('dialog', { name: 'Counts do not match' }).getByRole('button', { name: 'Close anyway' }).click()
  await expect(page.getByRole('heading', { name: 'Day closed' })).toBeVisible()
  await expect(page.getByText('Pepsi · 300ml Can: expected 1, came back 0')).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('No route for you today')).toBeVisible()
})

test('Manager: sees the difference, confirms cash; admin finds it in change history', async ({ page }) => {
  const errors = watchErrors(page)
  await login(page, ACCOUNTS.manager)
  await page.goto('/admin/closing')
  const card = page.locator('article', { hasText: run.routeName })
  await expect(card).toContainText('Awaiting cash')
  await expect(card).toContainText('expected 1, came back 0')
  await screenIsSound(page, 'closing')
  await card.getByLabel('Cash counted at office (₹)').fill('3000')
  await card.getByRole('button', { name: 'Confirm cash received' }).click()
  await expect(card).toContainText('Cash received')
  await expect(card.getByRole('button', { name: 'Reopen day' })).toHaveCount(0) // admin only
  expect(errors).toEqual([])
})

test('Admin: change history shows the end-of-day record', async ({ page }) => {
  await login(page, ACCOUNTS.admin)
  await page.goto('/admin/audit')
  await page.getByLabel('What').selectOption({ label: 'End of day' })
  await expect(page.locator('tbody tr').first()).toContainText('End of day')
  await expect(page.locator('tbody tr').first()).toContainText('QA Manager')
  await screenIsSound(page, 'audit')
})
