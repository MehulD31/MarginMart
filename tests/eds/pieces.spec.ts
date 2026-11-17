// Pieces in the browser, with the hidden QA item (24 per case) and a QA van: bill 18 pieces from the truck, bring 6 back.
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
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

test('Truck: bill 18 pieces of a 24-pack, bring 6 pieces back', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const VAN = `QA Van ${String(Date.now()).slice(-5)}`
  const van = (await rest('vehicle', { method: 'POST', body: JSON.stringify({ name: VAN, capacity_cases: 20 }) }))[0]
  const route = (await rest('route?select=id&name=eq.Direct%20sales'))[0].id
  const fx = await rpc('qa_fixture', {}) as { pack_id: string; variant_id: string }
  await rest(`pack?id=eq.${fx.pack_id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) })
  const shop = (await rest('shop', { method: 'POST', body: JSON.stringify({ name: `QA Pieces Shop ${Date.now() % 1e5}`, route_id: route, locality: 'Supela', phone: '9' + String(Date.now()).slice(-9) }) }))[0]
  await rpc('adjust_stock', { p_variant_id: fx.variant_id, p_mode: 'count', p_qty: 10, p_reason: 'QA pieces browser test' })
  const plan: string = await rpc('trip_open', { p_vehicle: van.id, p_date: TODAY })
  await rpc('trip_load', { p_plan: plan, p_driver: null, p_lines: [{ variant_id: fx.variant_id, qty: 2 }] })

  await login(page)
  await page.goto(`/admin/loading?trip=${plan}&step=bills`)
  await page.getByRole('button', { name: `New sale from ${VAN}` }).click()
  const sheet = page.locator('dialog[open]')
  await sheet.getByLabel('Search shop by name, owner, phone or area').fill(shop.name)
  await sheet.getByRole('button', { name: new RegExp(shop.name) }).click()
  await sheet.getByRole('button', { name: /QA Test Drink/ }).first().click()
  const line = sheet.getByTestId('sale-line')
  // 0 cases + 18 pieces
  await line.getByTestId('pcs-field').locator('input').fill('18')                  // 1 case + 18 pieces
  await line.getByRole('button', { name: /^One less/ }).click()                    // down to 0 cases: the line stays because it has pieces
  await expect(line.getByTestId('pcs-field').locator('input')).toHaveValue('18')
  await expect(line).toContainText('18 pcs')
  await sheet.getByRole('button', { name: 'Save sale' }).click()
  const saved = sheet.getByText(/^Bill KD-\d+ saved/)
  await expect(saved).toBeVisible({ timeout: 20_000 })
  await sheet.getByRole('button', { name: 'Cancel' }).click()

  // truck shows 1 case 6 pieces left (1.25)
  await expect(page.getByTestId('left-total')).toHaveText('1.25', { timeout: 20_000 })
  const d = await rpc('trip_detail', { p_plan: plan }) as { items: { variant_id: string; billed: number; left: number }[] }
  const it = d.items.find((x) => x.variant_id === fx.variant_id)!
  expect(Number(it.billed)).toBeCloseTo(0.75, 5)
  expect(Number(it.left)).toBeCloseTo(1.25, 5)

  // came back: 1 case + 6 pieces
  await page.getByRole('navigation', { name: 'Trip steps' }).getByRole('button', { name: /Came back/ }).click()
  const row = page.getByTestId('unload-row').filter({ hasText: 'QA Test Drink' })
  await row.getByRole('button', { name: /^Came back/ }).first().isVisible().catch(() => undefined)
  await row.getByTestId('back-pcs').locator('input').fill('6')
  await row.locator('.stepper input').fill('1')
  await expect(page.getByTestId('unload-summary')).toContainText('1.25')
  await page.getByRole('button', { name: /^Save:|^Unload/ }).click()
  await expect(page.getByText(/cases came back/i).first()).toBeVisible({ timeout: 20_000 })
  await expect.poll(async () => Number(((await rpc('trip_detail', { p_plan: plan })) as { items: { variant_id: string; returned: number }[] }).items.find((x) => x.variant_id === fx.variant_id)!.returned), { timeout: 20_000 }).toBeCloseTo(1.25, 5)
  const d2 = await rpc('trip_detail', { p_plan: plan }) as { items: { variant_id: string; returned: number; left: number }[] }
  const it2 = d2.items.find((x) => x.variant_id === fx.variant_id)!
  expect(Number(it2.returned)).toBeCloseTo(1.25, 5)
  expect(Number(it2.left)).toBeCloseTo(0, 5)
  expect(errors).toEqual([])
})
