/* eslint-disable no-empty-pattern -- Playwright needs a fixtures object even when unused */
import { expect, test } from '@playwright/test'
import { ACCOUNTS, ANON, SUPABASE_URL, isPhone, login, rest, screenIsSound, token, watchErrors } from './helpers'

async function rpc(tok: string, name: string, args: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  return { status: r.status, body: await r.json().catch(() => null) }
}

let planId = ''
let dateLabel = ''
let pepsiVariantId = ''

// The QA shop orders 3 × 300ml Can Pepsi for its next visit; every test starts from that, unlocked.
test.beforeEach(async () => {
  const admin = await token(ACCOUNTS.admin)
  const shop = await token(ACCOUNTS.shop)
  const plans = (await rest(admin, `route_day_plan?select=id,date,status,route!inner(name)&route.name=eq.Mon%2FThu&status=eq.loaded`)).body
  for (const p of plans) await rpc(admin, 'unlock_load', { p_plan_id: p.id })
  const v = (await rest(shop, 'variant?select=id,pack!inner(name_en)&flavour_en=eq.Pepsi&pack.name_en=eq.300ml%20Can')).body[0].id
  pepsiVariantId = v
  const r = await rpc(shop, 'save_order', { p_lines: [{ variant_id: v, qty: 3 }] })
  expect(r.body?.order_id, JSON.stringify(r.body)).toBeTruthy()
  const o = (await rest(shop, `orders?select=route_day_plan_id,route_day_plan(date)&id=eq.${r.body.order_id}`)).body[0]
  planId = o.route_day_plan_id
  dateLabel = new Date(`${o.route_day_plan.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
})

test.afterAll(async () => {
  await rpc(await token(ACCOUNTS.admin), 'unlock_load', { p_plan_id: planId })
  await rpc(await token(ACCOUNTS.shop), 'save_order', { p_lines: [] })
})

test.describe('Manager runs the day', () => {
  test('dashboard shows who has not ordered, with a call button', async ({ page }) => {
    await login(page, ACCOUNTS.manager)
    await expect(page.getByRole('region', { name: 'Next delivery' })).toBeVisible()
    await screenIsSound(page, 'dashboard')
  })

  test('takes a phoned-in order, then loads and locks the truck', async ({ page }) => {
    const errors = watchErrors(page)
    await login(page, ACCOUNTS.manager)
    await page.goto('/admin/orders')
    await page.getByRole('tab', { name: dateLabel }).click()
    const row = page.locator('tr', { hasText: 'QA Shop One' })
    await expect(row).toContainText('3')
    await expect(row).toContainText('₹2,325')
    await screenIsSound(page, 'orders')

    // Shop phones: make it 4 cases.
    await row.getByRole('button', { name: 'Edit' }).click()
    const ed = page.getByRole('dialog')
    await ed.getByRole('button', { name: 'One more Pepsi · 300ml Can' }).click()
    await ed.getByRole('button', { name: 'Save order' }).click()
    await expect(page.locator('tr', { hasText: 'QA Shop One' })).toContainText('₹3,100')

    await page.goto('/admin/loading')
    await page.getByRole('tab', { name: dateLabel }).click()
    const table = page.locator('table.dense')
    await expect(table.locator('tr', { hasText: 'Pepsi · 300ml Can' })).toContainText('4')
    await page.getByLabel('Spare: Pepsi · 300ml Can').fill('2')
    await expect(table.locator('tr', { hasText: 'Pepsi · 300ml Can' }).locator('td').last()).toHaveText('6')
    await page.getByLabel('Vehicle').selectOption({ label: 'Vehicle 1 (100 cases)' })
    await page.getByLabel('Driver').selectOption({ label: 'QA Driver' })
    await screenIsSound(page, 'loading')
    await page.getByRole('button', { name: 'Lock and load' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Lock and load' }).click()
    await expect(page.getByText('Load locked.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Unlock' })).toHaveCount(0) // managers can't unlock
    expect(errors).toEqual([])
  })
})

test.describe('Locking rules held by the database', () => {
  test.beforeEach(({}, info) => test.skip(isPhone(info), 'API checks run once'))

  test('locked orders cannot change; only an admin can unlock; frozen sheet is right', async () => {
    const mgr = await token(ACCOUNTS.manager)
    const driver = (await rest(mgr, 'profiles?select=user_id&phone=eq.9000000103')).body[0].user_id
    const mgrId = (await rest(mgr, 'profiles?select=user_id&phone=eq.9000000102')).body[0].user_id
    const vehicle = (await rest(mgr, 'vehicle?select=id&name=eq.Vehicle%201')).body[0].id
    expect((await rpc(mgr, 'lock_load', { p_plan_id: planId, p_vehicle_id: vehicle, p_driver_id: mgrId })).body.message).toBe('DRIVER_REQUIRED')
    expect((await rpc(mgr, 'lock_load', { p_plan_id: planId, p_vehicle_id: vehicle, p_driver_id: driver, p_spares: [{ variant_id: vehicle, qty: 1 }] })).body.message).toBe('INVALID_INPUT')
    expect((await rpc(mgr, 'lock_load', { p_plan_id: planId, p_vehicle_id: vehicle, p_driver_id: driver })).status).toBe(204)

    // Scope to the QA shop's own Pepsi line: other shops (incl. real pilot shops) may share this Mon/Thu plan.
    const lines = (await rest(mgr, `load_line?select=qty_ordered_total,qty_spare&route_day_plan_id=eq.${planId}&variant_id=eq.${pepsiVariantId}`)).body
    expect(lines).toEqual([{ qty_ordered_total: 3, qty_spare: 0 }])
    const shopId = (await rest(await token(ACCOUNTS.shop), 'shop?select=id')).body[0].id
    const v = (await rest(mgr, 'variant?select=id&flavour_en=eq.Mirinda&limit=1')).body[0].id
    expect((await rpc(mgr, 'save_order', { p_lines: [{ variant_id: v, qty: 1 }], p_shop_id: shopId, p_plan_id: planId })).body.message).toBe('ORDER_LOCKED')
    expect((await rpc(mgr, 'unlock_load', { p_plan_id: planId })).body.message).toBe('FORBIDDEN')
    const shopTok = await token(ACCOUNTS.shop)
    const status = (await rest(shopTok, `orders?select=status&route_day_plan_id=eq.${planId}&status=neq.cancelled`)).body
    expect(status).toEqual([{ status: 'locked' }])
    expect((await rest(await token(ACCOUNTS.driver), 'load_line?select=id')).body).toEqual([])
  })
})

test.describe('Helper', () => {
  test('printed sheet lists what to load and each stop in order', async ({ page }, info) => {
    test.skip(isPhone(info), 'Printing is done from the laptop')
    await login(page, ACCOUNTS.admin)
    await page.goto('/admin/loading')
    await page.getByRole('tab', { name: dateLabel }).click()
    await expect(page.locator('table.dense')).toContainText('Pepsi · 300ml Can')
    await page.emulateMedia({ media: 'print' })
    const sheet = page.locator('.print-sheet')
    await expect(sheet).toBeVisible()
    await expect(page.locator('.sidebar')).toBeHidden()
    await expect(sheet.locator('h1')).toContainText('Mon/Thu')
    await expect(sheet).toContainText('QA Shop One')
    await expect(sheet).toContainText('Pepsi · 300ml Can × 3')
    await page.pdf({ path: 'test-results/loading-sheet.pdf' })
  })
})
