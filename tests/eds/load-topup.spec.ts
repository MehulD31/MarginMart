// Add a forgotten item to a truck's load after selling started (hidden QA item and a QA van only).
import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
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
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

test('Truck: add a forgotten case to the load after billing started', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const van = (await rest('vehicle', { method: 'POST', body: JSON.stringify({ name: `QA Van ${String(Date.now()).slice(-5)}`, capacity_cases: 20 }) }))[0]
  const route = (await rest('route?select=id&name=eq.Direct%20sales'))[0].id
  const fx = await rpc('qa_fixture', {}) as { pack_id: string; variant_id: string }
  await rest(`pack?id=eq.${fx.pack_id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) })
  const shop = (await rest('shop', { method: 'POST', body: JSON.stringify({ name: `QA TopUp Shop ${Date.now() % 1e5}`, route_id: route, locality: 'Supela', phone: '9' + String(Date.now()).slice(-9) }) }))[0]
  await rpc('adjust_stock', { p_variant_id: fx.variant_id, p_mode: 'count', p_qty: 10, p_reason: 'QA top-up browser test' })
  const plan: string = await rpc('trip_open', { p_vehicle: van.id, p_date: TODAY })
  await rpc('trip_load', { p_plan: plan, p_driver: null, p_lines: [{ variant_id: fx.variant_id, qty: 2 }] })
  await rpc('counter_sale_save_into', { p_id: null, p_action: randomUUID(), p_shop: shop.id, p_mode: 'cash', p_lines: [{ variant_id: fx.variant_id, qty: 1, price_paise: 10000 }], p_account: null, p_discount: 0, p_plan: plan })

  await login(page)
  await page.goto(`/admin/loading?trip=${plan}&step=load`)
  await page.getByTestId('top-up').click()
  const row = page.getByTestId('load-row').filter({ hasText: 'QA Test Drink' })
  await expect(row).toContainText('sold 1')
  await row.getByRole('button', { name: /^One more/ }).click()
  await page.getByRole('button', { name: 'Save new load' }).click()
  await expect(page.getByText(/updated: 3 cases/)).toBeVisible({ timeout: 20_000 })
  const d = await rpc('trip_detail', { p_plan: plan }) as { items: { variant_id: string; loaded: number; left: number }[] }
  const it = d.items.find((x) => x.variant_id === fx.variant_id)!
  expect(it.loaded).toBe(3)
  expect(it.left).toBe(2)
  expect(errors).toEqual([])
  await rpc('qa_cleanup', {})
})
