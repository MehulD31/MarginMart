// A bill that is part paid: the unpaid part shows on the bill and in the shop's Khata; Khata "Payments received" lists what came in.
// Hidden QA item and a QA shop only.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const U = env.VITE_SUPABASE_URL, A = env.VITE_SUPABASE_ANON_KEY
const H = (t?: string) => ({ apikey: A, Authorization: `Bearer ${t ?? A}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
let tok = ''
async function token() { if (!tok) tok = (await (await fetch(`${U}/functions/v1/pin-login`, { method: 'POST', headers: H(), body: JSON.stringify({ phone: '8871565551', pin: '1234' }) })).json()).access_token; return tok }
async function rest(path: string, init: RequestInit = {}) { const r = await fetch(`${U}/rest/v1/${path}`, { ...init, headers: H(await token()) }); return r.json().catch(() => null) }
async function rpc(fn: string, args: unknown) {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(await token()), body: JSON.stringify(args) })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`${fn}: ${JSON.stringify(j)}`)
  return j
}
async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

test('Part paid bill: due note, badge, Khata open bills, payments received', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const route = (await rest('route?select=id&name=eq.Direct%20sales'))[0].id
  const fx = await rpc('qa_fixture', {}) as { pack_id: string; variant_id: string }
  await rest(`pack?id=eq.${fx.pack_id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) })
  await rpc('adjust_stock', { p_variant_id: fx.variant_id, p_mode: 'count', p_qty: 10, p_reason: 'QA part-paid browser test' })
  const SHOP = `QA PartPaid Shop ${Date.now() % 1e5}`
  await rest('shop', { method: 'POST', body: JSON.stringify({ name: SHOP, route_id: route, locality: 'Supela', phone: '9' + String(Date.now()).slice(-9) }) })

  await login(page)
  await page.goto('/admin/sales')
  await page.getByRole('button', { name: 'New sale' }).click()
  const sheet = page.locator('dialog[open]')
  await sheet.getByLabel('Search shop by name, owner, phone or area').fill(SHOP)
  await sheet.getByRole('button', { name: new RegExp(SHOP) }).click()
  await sheet.getByLabel(/^Add an item/).fill('QA Test')
  await sheet.getByRole('button', { name: /QA Test Drink/ }).first().click()
  await sheet.getByLabel(/^Rate: QA Test Drink/).fill('500')           // 1 case at 500
  await sheet.getByLabel('Part paid').check()
  await sheet.getByTestId('received').fill('200')
  await expect(sheet.getByTestId('due-note')).toContainText('300')
  await sheet.getByTestId('received').fill('500')                       // not less than the bill: refused
  await expect(sheet.getByRole('button', { name: 'Save sale' })).toBeDisabled()
  await sheet.getByTestId('received').fill('200')
  await sheet.getByRole('button', { name: 'Save sale' }).click()
  const saved = page.getByText(/^Saved KD-\d+/)
  await expect(saved).toBeVisible({ timeout: 20_000 })
  const number = (await saved.innerText()).match(/KD-\d+/)![0]
  await expect(page.getByTestId('sale-card').filter({ hasText: number }).getByTestId('pay-badge')).toContainText('300')

  await page.goto('/admin/khata')
  await page.getByRole('searchbox').fill(SHOP)
  await page.getByRole('row', { name: new RegExp(SHOP) }).getByRole('button', { name: 'Open' }).click()
  const open = page.getByTestId('open-bills')
  await expect(open).toContainText(number)
  await expect(open).toContainText('₹300 left')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Received' }).click()
  await expect(page.getByTestId('received-list').locator('li').filter({ hasText: SHOP })).toContainText('₹200')
  expect(errors).toEqual([])
  await rpc('qa_cleanup', {})
})
