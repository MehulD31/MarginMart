// Vehicle trip end to end in the browser: load the truck (advance order pre-filled) -> deliver the order ->
// bill a parchi from the truck -> unload with check boxes -> close with a shortage reason -> board shows it red.
// Uses only a test vehicle "QA Van …" and a test shop "QA …"; remove them afterwards with tests/db/cleanup.sql.
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
type Item = { variant_id: string; label: string; godown: number; loaded: number; returned: number; delivered: number; billed: number; left: number }

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

test('Vehicle trip: load, deliver, bill from truck, unload, close with shortage', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const tag = String(Date.now()).slice(-5)
  const VAN = `QA Van ${tag}`, SHOP = `QA Trip Shop ${tag}`

  // --- set-up: a test van, a test shop, and an advance order of 2 Sting on today's trip
  const van = (await rest('vehicle', { method: 'POST', body: JSON.stringify({ name: VAN, capacity_cases: 20 }) }))[0]
  const route = (await rest('route?select=id&name=eq.Direct%20sales'))[0].id
  const shop = (await rest('shop', { method: 'POST', body: JSON.stringify({ name: SHOP, owner_name: 'Qa Owner', route_id: route, locality: 'Supela' }) }))[0]
  expect(van?.id && shop?.id).toBeTruthy()
  const plan: string = await rpc('trip_open', { p_vehicle: van.id, p_date: TODAY })
  const items0 = (await rpc('trip_detail', { p_plan: plan })).items as Item[]
  const sting = items0.find((i) => i.label === 'Sting PET 250ml (Red)')!
  const nimbooz = items0.find((i) => /^Nimbooz/.test(i.label) && i.godown >= 5)!
  expect(sting.godown).toBeGreaterThanOrEqual(10)
  const cat = (await rpc('counter_catalog', {})) as { variant_id: string; trade_paise: number }[]
  const stingRate = cat.find((c) => c.variant_id === sting.variant_id)!.trade_paise
  await rpc('save_order', { p_shop_id: shop.id, p_plan_id: plan, p_lines: [{ variant_id: sting.variant_id, qty: 2, price_paise: stingRate }] })

  await login(page)
  await page.goto('/admin/loading')

  // --- board: grey card, order waiting
  const card = page.getByTestId('trip-card').filter({ hasText: VAN })
  await expect(card).toHaveAttribute('data-stage', 'load', { timeout: 20_000 })
  await expect(card.getByText('1 advance order waiting · 2 cases')).toBeVisible()
  await card.getByRole('button', { name: `Load ${VAN}` }).click()

  // --- load: order pre-filled (Sting 2), add 3 more Sting + 2 Nimbooz
  await expect(page.getByText('1 advance order is already filled in.', { exact: false })).toBeVisible()
  await expect(page.getByLabel(`Cases of ${sting.label}`)).toHaveValue('2')
  await page.getByLabel('Search item').fill(nimbooz.label)
  await page.getByRole('button', { name: `Add: ${nimbooz.label}` }).click()
  await page.getByRole('button', { name: `One more ${nimbooz.label}` }).click()
  await page.getByLabel('Search item').fill('')
  await page.getByRole('tab', { name: /In load/ }).click()
  await expect(page.getByTestId('load-row')).toHaveCount(2)
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: `One more ${sting.label}` }).click()
  await expect(page.getByTestId('load-bar')).toContainText('7 cases')
  await page.getByTestId('load-bar').getByRole('button', { name: `Load ${VAN}` }).click()
  await expect(page.getByText(`${VAN} loaded: 7 cases left the godown.`)).toBeVisible({ timeout: 20_000 })
  await expect(card).toHaveAttribute('data-stage', 'onRoad')
  let items = (await rpc('trip_detail', { p_plan: plan })).items as Item[]
  expect(items.find((i) => i.variant_id === sting.variant_id)).toMatchObject({ loaded: 5, godown: sting.godown - 5 })
  expect(items.find((i) => i.variant_id === nimbooz.variant_id)).toMatchObject({ loaded: 2, godown: nimbooz.godown - 2 })

  // --- evening: open the trip, deliver the advance order (cash), then a parchi of 2 Sting from the truck
  await card.getByRole('button', { name: 'Truck is back → Unload' }).click()
  const steps = page.getByRole('navigation', { name: 'Trip steps' })
  await steps.getByRole('button', { name: /Parchis/ }).click()
  const order = page.getByTestId('trip-order').filter({ hasText: SHOP })
  await order.getByRole('button', { name: 'Delivered', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm delivery' }).click()
  await expect(page.getByText(`${SHOP}: delivered`, { exact: false })).toBeVisible({ timeout: 20_000 })
  await expect(order.getByText('Delivered', { exact: true })).toBeVisible()
  await expect(page.getByTestId('bill-progress')).toContainText('5 cases on the truck have no parchi yet')

  await page.getByRole('button', { name: `New sale from ${VAN}` }).click()
  const sheet = page.locator('dialog[open]')
  await expect(sheet.getByTestId('truck-tag')).toHaveText(`🚚 From ${VAN}`)
  await sheet.getByLabel('Search shop by name, owner, phone or area').fill(SHOP)
  await sheet.getByRole('button', { name: new RegExp(SHOP) }).click()
  // only what is on the truck is offered, with how much is left
  await expect(sheet.getByRole('button', { name: /3 on truck/ })).toBeVisible()
  await expect(sheet.getByRole('button', { name: /2 on truck/ })).toBeVisible()
  await sheet.getByRole('button', { name: /3 on truck/ }).click()
  const line = sheet.getByTestId('sale-line')
  await line.getByRole('button', { name: /^One more/ }).click()
  await line.getByRole('button', { name: /^One more/ }).click()
  await expect(line.getByRole('button', { name: /^One more/ })).toBeDisabled()     // 3 is all the truck has
  await line.getByRole('button', { name: /^One less/ }).click()
  await sheet.getByRole('button', { name: 'Save sale' }).click()
  const saved = sheet.getByText(/^Bill KD-\d+ saved/)
  await expect(saved).toBeVisible({ timeout: 20_000 })
  const number = (await saved.innerText()).match(/KD-\d+/)![0]
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('trip-bill').filter({ hasText: number })).toBeVisible()
  await expect(page.getByTestId('left-total')).toHaveText('3')

  // --- unload: everything came back, then 1 Nimbooz less (it was broken)
  await steps.getByRole('button', { name: /Came back/ }).click()
  await page.getByRole('button', { name: 'Everything came back' }).click()
  await page.getByRole('button', { name: `One less Came back: ${nimbooz.label}` }).click()
  await expect(page.getByTestId('unload-summary')).toContainText('Sold, parchi still to enter1')
  // the choice is visible (not under the bottom bar); keep on truck is the default
  await expect(page.getByTestId('keep-choice')).toBeInViewport()
  await expect(page.getByRole('radio', { name: 'Keep on truck' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: 'Save: 2 stay on truck' })).toBeVisible()
  await page.getByRole('radio', { name: 'Unload to godown' }).click()
  await page.getByRole('button', { name: 'Unload 2 → godown' }).click()
  await expect(page.getByText('2 cases came back.', { exact: false })).toBeVisible({ timeout: 20_000 })
  items = (await rpc('trip_detail', { p_plan: plan })).items as Item[]
  expect(items.find((i) => i.variant_id === sting.variant_id)).toMatchObject({ returned: 1, delivered: 2, billed: 2, left: 0, godown: sting.godown - 4 })
  expect(items.find((i) => i.variant_id === nimbooz.variant_id)).toMatchObject({ returned: 1, left: 1, godown: nimbooz.godown - 1 })

  // --- close: 1 short needs a reason
  await steps.getByRole('button', { name: /Close/ }).click()
  await expect(page.getByTestId('short-box')).toContainText('1 cases are missing')
  const closeBtn = page.getByRole('button', { name: 'Close with 1 short' })
  await expect(closeBtn).toBeDisabled()
  await page.getByLabel(/Reason for the shortage/).fill('QA 1 Nimbooz broken')
  await closeBtn.click()
  await expect(page.getByText(`${VAN}: trip closed with 1 cases short.`)).toBeVisible({ timeout: 20_000 })
  await expect(card).toHaveAttribute('data-stage', 'closed')
  await expect(card.getByText('Closed · 1 short')).toBeVisible()
  await expect(card.getByText('Reason: QA 1 Nimbooz broken')).toBeVisible()
  const board = (await rpc('trip_board', { p_date: TODAY })) as { vehicle: string; short_cases: number; close_note: string; status: string }[]
  expect(board.find((b) => b.vehicle === VAN)).toMatchObject({ status: 'closed', short_cases: 1, close_note: 'QA 1 Nimbooz broken' })

  // --- the bill shows its truck on Counter sales
  await page.goto('/admin/sales')
  await expect(page.getByTestId('sale-card').filter({ hasText: number }).getByTestId('truck-badge')).toHaveText(`🚚 ${VAN}`)
  expect(errors).toEqual([])
})
