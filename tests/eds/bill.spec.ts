// GST bills in the browser, against the LIVE bill function (the dev server has no /api, so calls are sent to production).
// Makes a QA shop + bill, checks Bill PDF, WhatsApp bill, Business & GST page and the HSN/GST fields, then removes the bill.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const U = env.VITE_SUPABASE_URL, A = env.VITE_SUPABASE_ANON_KEY
const PROD = 'https://kdfoods.vercel.app'
const H = (t?: string) => ({ apikey: A, Authorization: `Bearer ${t ?? A}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
async function token(phone = '8871565551', pin = '1234') { return (await (await fetch(`${U}/functions/v1/pin-login`, { method: 'POST', headers: H(), body: JSON.stringify({ phone, pin }) })).json()).access_token as string }
async function rest(path: string, init: RequestInit = {}) { const r = await fetch(`${U}/rest/v1/${path}`, { ...init, headers: H(await token()) }); return r.json().catch(() => null) }
async function rpc(fn: string, args: unknown) { const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(await token()), body: JSON.stringify(args) }); return r.json().catch(() => null) }

test.describe.configure({ mode: 'serial' })
let bill: { id: string; number: string }
const SHOP = `QA BILL UI ${String(Date.now()).slice(-5)}`

test.beforeAll(async () => {
  const route = (await rest('route?select=id&name=eq.Direct%20sales'))[0].id
  const shop = (await rest('shop', { method: 'POST', body: JSON.stringify({ name: SHOP, route_id: route, phone: '9' + String(Date.now()).slice(-9) }) }))[0]
  const cat = await rpc('counter_catalog', {}) as { variant_id: string; label: string }[]
  const v = (l: string) => cat.find((c) => c.label === l)!.variant_id
  bill = await rpc('counter_sale_save', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'upi', p_lines: [
    { variant_id: v('Sting PET 250ml (Red)'), qty: 50, price_paise: 49500 }, { variant_id: v('Nimbooz 345ml'), qty: 3, price_paise: 51500 }] })
})
test.afterAll(async () => { if (bill?.id) await rpc('admin_delete', { p_kind: 'counter_sale', p_id: bill.id }) })

async function open(page: Page) {
  await page.route('**/api/bill-pdf**', async (route) => {
    const u = new URL(route.request().url())
    await route.fulfill({ response: await route.fetch({ url: `${PROD}/api/bill-pdf${u.search}`, timeout: 60_000 }) })
  })
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

test('Bill PDF opens the GST bill; WhatsApp bill carries the PDF link', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await page.goto('/admin/sales')
  const card = page.getByTestId('sale-card').filter({ hasText: bill.number })
  await expect(card).toBeVisible({ timeout: 20_000 })

  // Bill PDF -> new tab with the signed production link; the PDF itself is real and complete
  const [tab] = await Promise.all([context.waitForEvent('page'), card.getByRole('button', { name: `Bill PDF: ${bill.number}` }).click()])
  await tab.waitForURL(/\/api\/bill-pdf\?id=.+&t=/, { timeout: 30_000 })
  const url = tab.url().replace(/^http:\/\/localhost:\d+/, PROD)
  await tab.close()
  const r = await fetch(url)
  expect(r.status).toBe(200)
  expect(r.headers.get('content-type')).toBe('application/pdf')
  const pdf = Buffer.from(await r.arrayBuffer())
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdf.length).toBeGreaterThan(10_000)

  // WhatsApp bill -> wa.me with the shop number, total and the same kind of link
  const [wa] = await Promise.all([context.waitForEvent('page'), card.getByRole('button', { name: `WhatsApp bill: ${bill.number}` }).click()])
  await wa.waitForURL(/wa\.me|whatsapp/, { timeout: 30_000 }).catch(() => {})
  const waUrl = decodeURIComponent(wa.url())
  await wa.close()
  expect(waUrl).toMatch(/wa\.me\/919\d{9}|phone=919\d{9}/)
  expect(waUrl).toContain(`K.D. Foods bill ${bill.number}`)
  expect(waUrl).toContain('Total: ₹26,295')
  expect(waUrl).toMatch(/Bill PDF: https:\/\/kdfoods\.vercel\.app\/api\/bill-pdf\?id=[0-9a-f-]{36}&t=[\w-]{32}/)
  expect(errors).toEqual([])
})

test('Links are locked: wrong token, no login, and a driver are refused', async () => {
  const bad = await fetch(`${PROD}/api/bill-pdf?id=${bill.id}&t=${'A'.repeat(32)}`)
  expect(bad.status).toBe(403)
  expect((await fetch(`${PROD}/api/bill-pdf?id=${bill.id}`)).status).toBe(401)
  expect((await fetch(`${PROD}/api/bill-pdf?id=not-a-bill`)).status).toBe(400)
  const driver = await fetch(`${PROD}/api/bill-pdf?id=${bill.id}&link=1`, { headers: { Authorization: `Bearer ${await token('1111111111', '1111')}` } })
  expect(driver.status).toBe(403)
  const admin = await (await fetch(`${PROD}/api/bill-pdf?id=${bill.id}&link=1`, { headers: { Authorization: `Bearer ${await token()}` } })).json()
  expect(admin.number).toBe(bill.number)
})

test('Business & GST page: bad GSTIN blocked, items all have GST, Catalogue shows HSN', async ({ page }) => {
  await open(page)
  await page.goto('/admin/business')
  await expect(page.getByRole('heading', { name: 'Business & GST', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Registered company name')).toHaveValue('Fortifit Nutrition Private Limited')
  const g = page.getByLabel('GSTIN')
  await expect(g).toHaveValue('')
  await expect(page.getByText(/No GSTIN yet/)).toBeVisible()
  await g.fill('22ABC')
  await expect(page.getByText(/not a valid Chhattisgarh GSTIN/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  await g.fill('')                                           // leave the real GSTIN for the owner; nothing saved here
  await expect(page.getByTestId('gst-missing')).toContainText('Gatorade 500ml')   // not on the 4 Nov invoices: never guessed

  await page.goto('/admin/catalog')
  await page.getByLabel('Search').fill('Sting PET')
  await page.getByRole('button', { name: /Sting PET 250ml/ }).first().click()
  await expect(page.getByLabel('HSN code')).toHaveValue('22029999')
  await expect(page.getByLabel('GST rate')).toHaveValue('40')
})
