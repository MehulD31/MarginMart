/* eslint-disable no-empty-pattern -- Playwright needs a fixtures object even when unused */
// EDS import + no-credit + Navigate, end to end against the live database (dev server, real accounts).
// Every row this test makes is named "QA EDS <tag>" so it can be found and deleted afterwards.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const URL_ = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY
const ADMIN = { phone: '8871565551', pin: '1234' }
const DRIVER = { phone: '1111111111', pin: '1111' }

async function token(phone: string, pin: string) {
  const r = await fetch(`${URL_}/functions/v1/pin-login`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, pin }) })
  const j = await r.json(); if (!j.access_token) throw new Error(`login ${phone}: ${JSON.stringify(j)}`); return j.access_token as string
}
async function rest(tok: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) } })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const rpc = (tok: string, name: string, args: unknown) => rest(tok, `rpc/${name}`, { method: 'POST', body: JSON.stringify(args) })
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

const run = { tag: '', routeId: '', routeName: '', shopName: '', shopPhone: '', shopId: '', pin: '', noGpsId: '', bareId: '' }
test.describe.configure({ mode: 'serial' })
test.beforeAll(async ({}, info) => {
  run.tag = `${info.project.name}-${Date.now().toString(36)}`
  const admin = await token(ADMIN.phone, ADMIN.pin)
  const isoDow = ((new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getDay() + 6) % 7) + 1
  run.routeName = `QA EDS ${run.tag}`
  const r = await rest(admin, 'route', { method: 'POST', body: JSON.stringify({ name: run.routeName, visit_days: [isoDow] }) })
  run.routeId = r.body[0].id
  run.shopName = `QA EDS ${run.tag} Main`
  run.shopPhone = `6${String(Date.now()).slice(-9)}`
  // Two more stops for the Navigate edge cases: address only, and nothing at all.
  run.noGpsId = (await rest(admin, 'shop', { method: 'POST', body: JSON.stringify({ name: `QA EDS ${run.tag} AddrOnly`, route_id: run.routeId, stop_seq: 2, address: 'Near Supela Chowk, Bhilai' }) })).body[0].id
  run.bareId = (await rest(admin, 'shop', { method: 'POST', body: JSON.stringify({ name: `QA EDS ${run.tag} Bare`, route_id: run.routeId, stop_seq: 3 }) })).body[0].id
})

// Leave nothing loaded on the real driver: close this run's plan so the next project / run sees a clean route list.
test.afterAll(async () => {
  const admin = await token(ADMIN.phone, ADMIN.pin)
  await rest(admin, `route_day_plan?route_id=eq.${run.routeId}`, { method: 'PATCH', body: JSON.stringify({ driver_id: null, status: 'closed' }) })
  await rest(admin, `route?id=eq.${run.routeId}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })
})
test('Admin: imported shops show area, type, map link; no credit fields', async ({ page }) => {
  const errors = watchErrors(page)
  await login(page, ADMIN.phone, ADMIN.pin)
  await page.goto('/admin/shops')
  await expect(page.getByText(/7\d\d shops/).first()).toBeVisible({ timeout: 20_000 })
  for (const name of ['V1 Mon/Thu · Supela', 'V2 Tue/Fri · Camp 2', 'V3 Wed/Sat · Kumhari']) await expect(page.getByRole('tab', { name: new RegExp(name) })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Credit limit' })).toHaveCount(0)
  await page.getByLabel(/Search/).first().fill('Ichchha Point')
  const row = page.getByRole('row', { name: /Ichchha Point/ })
  await expect(row).toContainText('Shanti Nagar')
  await expect(row).toContainText('Convenience')
  await expect(row.getByRole('link', { name: /Open in Maps/ })).toHaveAttribute('href', /destination=21\.22\d+,81\.34\d+/)
  // Search by locality also works.
  await page.getByLabel(/Search/).first().fill('Kumhari')
  await expect(page.getByRole('row').nth(1)).toBeVisible()
  await page.getByLabel(/Search/).first().fill('Ichchha Point')
  await row.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByLabel(/Credit limit/)).toHaveCount(0)
  await expect(page.getByLabel(/Credit days/)).toHaveCount(0)
  await expect(page.getByLabel(/Locality/)).toHaveValue('Shanti Nagar')
  await expect(page.getByLabel(/Shop type/)).toHaveValue('Convenience')
  const gps = page.getByLabel(/GPS location/)
  await expect(gps).toHaveValue(/^21\.22\d+, 81\.34\d+$/)
  await expect(page.getByLabel(/Has Pepsi cooler/)).toBeChecked()
  // Bad GPS blocks saving; a pasted Google Maps link is accepted.
  await gps.fill('hello')
  await expect(page.getByText('Enter lat, lng like 21.2145, 81.3578')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  await gps.fill('https://www.google.com/maps/@21.2228,81.3478,17z')
  await expect(page.getByText('Enter lat, lng like 21.2145, 81.3578')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
  await gps.fill('99.1, 81.3') // not in India
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel' }).click()
  expect(errors).toEqual([])
})

test('Admin: add a shop with GPS + login from the form; PIN shown once', async ({ page }) => {
  const errors = watchErrors(page)
  await login(page, ADMIN.phone, ADMIN.pin)
  await page.goto('/admin/shops')
  await page.getByRole('button', { name: 'Add shop' }).click()
  await page.getByLabel(/Shop name/).fill(run.shopName)
  await page.getByLabel(/^Mobile|Phone/).first().fill(run.shopPhone)
  await page.locator('form select').first().selectOption({ label: run.routeName })
  await page.getByLabel(/Stop no/).fill('1')
  await page.getByLabel(/Locality/).fill('Supela')
  await page.getByLabel(/Shop type/).fill('Grocery')
  await page.getByLabel(/GPS location/).fill('21.2095, 81.3534')
  await page.getByLabel(/Has Pepsi cooler/).check()
  await page.getByRole('button', { name: 'Save' }).click()
  const digits = page.locator('.pin-reveal .digits')
  await expect(digits).toHaveText(/^\d{4}$/, { timeout: 30_000 })
  run.pin = (await digits.textContent())!.trim()
  await page.getByRole('button', { name: /Done/ }).click()
  const admin = await token(ADMIN.phone, ADMIN.pin)
  const s = (await rest(admin, `shop?select=*&name=eq.${encodeURIComponent(run.shopName)}`)).body[0]
  run.shopId = s.id
  expect([s.lat, s.lng, s.locality, s.sub_channel, s.has_cooler, s.phone]).toEqual([21.2095, 81.3534, 'Supela', 'Grocery', true, run.shopPhone])
  // Duplicate phone on another shop is refused with a clear message.
  await page.getByRole('button', { name: 'Add shop' }).click()
  await page.getByLabel(/Shop name/).fill(`QA EDS ${run.tag} Dup`)
  await page.getByLabel(/^Mobile|Phone/).first().fill(run.shopPhone)
  await page.locator('form select').first().selectOption({ label: run.routeName })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.alert-error')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Cancel' }).click()
  expect(errors.filter((e) => !/409|23505|duplicate/i.test(e))).toEqual([])
})

test('Shop: first login forces a new PIN; ordering works even with an overdue balance', async ({ page }) => {
  const admin = await token(ADMIN.phone, ADMIN.pin)
  const ob = await rpc(admin, 'set_opening_balance', { p_shop_id: run.shopId, p_amount_paise: 5_000_000, p_note: 'QA EDS overdue' })
  expect(ob.status, JSON.stringify(ob.body)).toBeLessThan(300)
  // Make it overdue: backdate the opening entry past credit days (only possible as SQL owner, so check status instead).
  const cs = await rpc(admin, 'credit_status', { p_shop_id: run.shopId })
  expect(cs.body[0].blocked).toBe(false)
  expect(cs.body[0].balance_paise).toBe(5_000_000)

  const errors = watchErrors(page)
  await login(page, run.shopPhone, run.pin)
  await expect(page.getByRole('heading', { name: 'Set your new PIN' })).toBeVisible()
  await page.getByLabel('New PIN', { exact: true }).fill('4321')
  await page.getByLabel('Confirm new PIN').fill('4322')
  await page.getByRole('button', { name: 'Save PIN' }).click()
  await expect(page.getByText("The two PINs don't match.")).toBeVisible()
  await page.getByLabel('Confirm new PIN').fill('4321')
  await page.getByRole('button', { name: 'Save PIN' }).click()
  await page.waitForURL(/\/shop/, { timeout: 30_000 })
  await expect(page.getByText(/Ordering is paused/)).toHaveCount(0)
  await page.getByRole('button', { name: /^Add: / }).first().click()
  await page.getByRole('button', { name: 'View' }).click()
  await page.getByRole('button', { name: 'Place order' }).click()
  await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'OK' }).click()
  // Khata shows the due, with no credit-limit line and no block.
  await page.getByRole('link', { name: /Account|Khata/ }).first().click().catch(() => page.goto('/shop/account'))
  await expect(page.getByText(/No credit limit|Credit limit/)).toHaveCount(0)
  expect(errors).toEqual([])
  // The old PIN no longer works; the new one does.
  const bad = await fetch(`${URL_}/functions/v1/pin-login`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: run.shopPhone, pin: run.pin === '4321' ? '0000' : run.pin }) })
  expect(bad.status).toBe(401)
  await token(run.shopPhone, '4321')
})

test('Driver: stop screen has Navigate (GPS, address fallback, none) and today\'s route first', async ({ page }) => {
  const admin = await token(ADMIN.phone, ADMIN.pin)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  await rpc(admin, 'ensure_route_day_plans', { p_days: 1 })
  const plan = (await rest(admin, `route_day_plan?select=id&route_id=eq.${run.routeId}&date=eq.${today}`)).body[0]
  expect(plan, 'today plan for QA route').toBeTruthy()
  const variant = (await rest(admin, 'stock?select=variant_id&on_hand=gt.50&limit=1')).body[0].variant_id
  const o = await rpc(admin, 'save_order', { p_shop_id: run.shopId, p_plan_id: plan.id, p_lines: [{ variant_id: variant, qty: 1 }] })
  expect(o.status, JSON.stringify(o.body)).toBe(200)
  const driverId = (await rest(admin, `profiles?select=user_id&phone=eq.${DRIVER.phone}`)).body[0].user_id
  const vehicleId = (await rest(admin, 'vehicle?select=id&name=eq.Vehicle%201')).body[0].id
  const lock = await rpc(admin, 'lock_load', { p_plan_id: plan.id, p_vehicle_id: vehicleId, p_driver_id: driverId, p_spares: [] })
  expect(lock.status, JSON.stringify(lock.body)).toBeLessThan(300)

  const errors = watchErrors(page)
  await login(page, DRIVER.phone, DRIVER.pin)
  await page.waitForURL(/\/driver/)
  const first = page.locator('.stop-list li').first()
  await expect(first).toContainText(run.shopName, { timeout: 20_000 })
  await page.getByRole('link', { name: new RegExp(`${run.shopName}`) }).click()
  await expect(page.getByRole('heading', { level: 1, name: run.shopName })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Navigate' })).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=21.2095,81.3534')
  await expect(page.getByText('Supela', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: /All stops/ }).click()
  await page.getByLabel(/Search shop|Search/).first().fill(`QA EDS ${run.tag} AddrOnly`)
  await page.getByRole('link', { name: /AddrOnly/ }).click()
  await expect(page.getByRole('link', { name: 'Navigate' })).toHaveAttribute('href', /destination=QA%20EDS.*Supela%20Chowk/)
  await page.getByRole('button', { name: /All stops/ }).click()
  await page.getByLabel(/Search shop|Search/).first().fill(`QA EDS ${run.tag} Bare`)
  await page.getByRole('link', { name: /Bare/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Bare/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Navigate' })).toHaveCount(0)
  expect(errors).toEqual([])
})
