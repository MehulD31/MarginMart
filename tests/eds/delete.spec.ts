// Admin Delete buttons across the website, against the live database. Each test makes its own "QA DEL" record,
// deletes it through the UI (confirm sheet), and checks it is really gone. Also checks Cancel keeps it and refusals show a reason.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
// Owner rule: tests never move real stock or bill real shops. Stock and bills use the hidden QA Test Drink / QA Test Shop.
// @ts-expect-error plain JS helper
import { qaFixture } from '../db/lib.mjs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const U = env.VITE_SUPABASE_URL, A = env.VITE_SUPABASE_ANON_KEY
const H = (t?: string) => ({ apikey: A, Authorization: `Bearer ${t ?? A}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
async function token() { return (await (await fetch(`${U}/functions/v1/pin-login`, { method: 'POST', headers: H(), body: JSON.stringify({ phone: '8871565551', pin: '1234' }) })).json()).access_token as string }
async function rest(path: string, init: RequestInit = {}) { const r = await fetch(`${U}/rest/v1/${path}`, { ...init, headers: H(await token()) }); return r.json().catch(() => null) }
async function rpc(fn: string, args: unknown) { const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(await token()), body: JSON.stringify(args) }); return r.json().catch(() => null) }
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // A refused delete returns HTTP 400 by design; the page shows the reason. Ignore that network line only.
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  return errors
}
async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}
/** Click Delete for `name`, then confirm (or cancel) in the app's confirm sheet. */
async function deleteVia(page: Page, name: string, ok = true) {
  await page.getByRole('button', { name: `Delete: ${name}` }).first().click()
  const dlg = page.getByRole('dialog').filter({ hasText: `Delete ${name}?` })
  await expect(dlg).toBeVisible()
  await dlg.getByRole('button', { name: ok ? 'Delete' : 'Cancel', exact: true }).click()
}

test.describe.configure({ mode: 'serial' })

test('Counter sale: Cancel keeps it, Delete removes it and puts stock back', async ({ page }) => {
  const errors = watchErrors(page)
  const cat = await rpc('counter_catalog', {}) as { variant_id: string; label: string; on_hand: number }[]
  void cat
  const direct = (await rest('route?select=id&name=eq.Direct%20sales'))[0]
  const qa = await qaFixture(rest, direct.id)
  const stockOf = async () => (await rest(`stock?select=on_hand&variant_id=eq.${qa.variantId}`))[0]?.on_hand ?? 0
  const sting = { variant_id: qa.variantId as string, on_hand: await stockOf() }
  const shop = qa.shop
  const bill = await rpc('counter_sale_save', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [{ variant_id: sting.variant_id, qty: 2, price_paise: 50000 }] })
  await login(page)
  await page.goto('/admin/sales')
  await expect(page.getByTestId('sale-card').filter({ hasText: bill.number })).toBeVisible({ timeout: 20_000 })
  await deleteVia(page, bill.number, false)
  await expect(page.getByTestId('sale-card').filter({ hasText: bill.number })).toBeVisible()
  await deleteVia(page, bill.number)
  await expect(page.getByText(`Deleted ${bill.number}.`)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('sale-card').filter({ hasText: bill.number })).toHaveCount(0)
  expect(await stockOf()).toBe(sting.on_hand)
  await qa.hide()
  expect(errors).toEqual([])
})

test('Scheme, supplier and join request delete; Direct sales route refuses with a reason', async ({ page }) => {
  const errors = watchErrors(page)
  const JOIN = 'QA DEL Join ' + String(Date.now()).slice(-5)
  const qa = await qaFixture(rest)
  const pack = { id: qa.packId, name_en: 'QA Test Drink' }
  await rest('scheme', { method: 'POST', body: JSON.stringify({ pack_id: pack.id, kind: 'pass_through', amount_paise: 1000, starts_on: TODAY, ends_on: TODAY, note: 'QA DEL' }) })
  await rest('supplier', { method: 'POST', body: JSON.stringify({ name: 'QA DEL Supplier' }) })
  await fetch(`${U}/rest/v1/rpc/submit_join_request`, { method: 'POST', headers: H(), body: JSON.stringify({ p_phone: '6' + String(Date.now()).slice(-9), p_shop_name: JOIN, p_owner_name: 'QA', p_address: 'x' }) })
  await login(page)

  await page.goto('/admin/schemes')
  const row = page.getByRole('row').filter({ hasText: 'QA DEL' })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.getByRole('button', { name: `Delete: ${pack.name_en}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'QA DEL' })).toHaveCount(0, { timeout: 15_000 })

  await page.goto('/admin/purchases')
  await page.getByRole('button', { name: /Suppliers/ }).click()
  await deleteVia(page, 'QA DEL Supplier')
  await expect(page.getByText('QA DEL Supplier', { exact: true })).toHaveCount(0, { timeout: 15_000 })
  await page.keyboard.press('Escape')

  await page.goto('/admin/join-requests')
  await deleteVia(page, JOIN)
  await expect(page.getByRole('heading', { name: JOIN, exact: true })).toHaveCount(0, { timeout: 15_000 })

  await page.goto('/admin/network')
  await page.getByRole('button', { name: /Direct sales/ }).click()
  await deleteVia(page, 'Direct sales')
  await expect(page.getByText('This route is used by the Telegram bot for new shops, so it cannot be deleted.')).toBeVisible({ timeout: 15_000 })
  await qa.hide()
  expect(errors.filter((e) => !/400/.test(e))).toEqual([])
})

test('Vehicle, login and catalogue flavour delete', async ({ page }) => {
  const errors = watchErrors(page)
  await rest('vehicle', { method: 'POST', body: JSON.stringify({ name: 'QA DEL Van', capacity_cases: 50 }) })
  const phone = '6' + String(Date.now()).slice(-9)
  await fetch(`${U}/functions/v1/admin-users`, { method: 'POST', headers: H(await token()), body: JSON.stringify({ action: 'create', role: 'manager', name: 'QA DEL Manager', phone }) })
  const brand = (await rest('brand?select=id&limit=1'))[0]
  const pk = (await rest('pack', { method: 'POST', body: JSON.stringify({ brand_id: brand.id, name_en: 'QA DEL Pack', units_per_case: 24, mrp_paise: 2000 }) }))[0]
  await rest('variant', { method: 'POST', body: JSON.stringify({ pack_id: pk.id, flavour_en: 'QA Flavour A' }) })
  await login(page)

  await page.goto('/admin/network')
  await page.getByRole('button', { name: /QA DEL Van/ }).click()
  await deleteVia(page, 'QA DEL Van')
  await expect(page.getByRole('button', { name: /QA DEL Van/ })).toHaveCount(0, { timeout: 15_000 })

  await page.goto('/admin/users')
  await deleteVia(page, 'QA DEL Manager')
  await expect(page.getByText('QA DEL Manager', { exact: true })).toHaveCount(0, { timeout: 15_000 })
  // own login has no Delete
  await expect(page.getByRole('button', { name: 'Delete: Mehul', exact: true })).toHaveCount(0)

  await page.goto('/admin/catalog')
  await page.getByLabel('Search').fill('QA DEL')
  await page.getByRole('button', { name: /QA DEL Pack/ }).click()
  await deleteVia(page, 'QA Flavour A')
  await expect(page.getByLabel('Flavour (English)').or(page.getByText('QA Flavour A', { exact: true }))).toHaveCount(0, { timeout: 15_000 })
  await deleteVia(page, 'QA DEL Pack')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /QA DEL Pack/ })).toHaveCount(0, { timeout: 15_000 })
  expect((await rest(`pack?select=id&id=eq.${pk.id}`)).length).toBe(0)
  expect(errors).toEqual([])
})

test('Order, purchase (stock goes back) and empty route delete', async ({ page }) => {
  const errors = watchErrors(page)
  const tag = String(Date.now()).slice(-5)
  type Cat = { variant_id: string; label: string; on_hand: number }[]
  // order on the nearest planning trip, for the QA shop on that route, of the QA item (never a real shop or real stock)
  const plan = (await rest(`route_day_plan?select=id,route_id&status=eq.planning&date=gte.${TODAY}&order=date&limit=1`))[0]
  const qa = await qaFixture(rest, plan.route_id)
  const sting = (await rpc('counter_catalog', {}) as Cat).find((c) => c.variant_id === qa.variantId)!
  const shop = qa.shop as { id: string; name: string }
  await rpc('save_order', { p_lines: [{ variant_id: sting.variant_id, qty: 1, price_paise: 50000 }], p_shop_id: shop.id, p_plan_id: plan.id })
  const order = (await rest(`orders?select=id&shop_id=eq.${shop.id}&route_day_plan_id=eq.${plan.id}`))[0]
  expect(order?.id).toBeTruthy()
  // purchase of 1 case from a QA supplier
  const sup = (await rest('supplier', { method: 'POST', body: JSON.stringify({ name: `QA DEL Supplier ${tag}` }) }))[0]
  await rpc('record_purchase', { p_supplier_id: sup.id, p_invoice_no: `QA-${tag}`, p_date: TODAY, p_lines: [{ variant_id: sting.variant_id, qty: 1, cost_paise: 40000 }] })
  expect((await rpc('counter_catalog', {}) as Cat).find((c) => c.variant_id === sting.variant_id)!.on_hand).toBe(sting.on_hand + 1)
  // empty route
  await rest('route', { method: 'POST', body: JSON.stringify({ name: `QA DEL Route ${tag}`, visit_days: [1] }) })
  await login(page)

  await page.goto('/admin/orders')
  await deleteVia(page, shop.name)
  await expect(page.getByText(`Deleted ${shop.name}.`)).toBeVisible({ timeout: 15_000 })
  expect((await rest(`orders?select=id&id=eq.${order.id}`)).length).toBe(0)

  await page.goto('/admin/purchases')
  await page.getByRole('row').filter({ hasText: `QA-${tag}` }).getByRole('button', { name: 'View' }).click()
  await deleteVia(page, `QA DEL Supplier ${tag} QA-${tag}`)
  await expect(page.getByRole('row').filter({ hasText: `QA-${tag}` })).toHaveCount(0, { timeout: 15_000 })
  expect((await rpc('counter_catalog', {}) as Cat).find((c) => c.variant_id === sting.variant_id)!.on_hand).toBe(sting.on_hand)
  // supplier is free again once its purchase is gone
  await page.getByRole('button', { name: /Suppliers/ }).click()
  await deleteVia(page, `QA DEL Supplier ${tag}`)
  await expect(page.getByText(`QA DEL Supplier ${tag}`, { exact: true })).toHaveCount(0, { timeout: 15_000 })
  await page.keyboard.press('Escape')

  await page.goto('/admin/network')
  await page.getByRole('button', { name: new RegExp(`QA DEL Route ${tag}`) }).click()
  await deleteVia(page, `QA DEL Route ${tag}`)
  await expect(page.getByRole('button', { name: new RegExp(`QA DEL Route ${tag}`) })).toHaveCount(0, { timeout: 15_000 })
  expect((await rest(`route?select=id&name=eq.QA DEL Route ${tag}`)).length).toBe(0)
  await qa.hide()
  expect(errors).toEqual([])
})
