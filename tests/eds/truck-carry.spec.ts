// Leftover stays on the truck: evening "keep on truck" -> next morning the same truck shows it, the loader counts it
// (one case missing), the Load button stays locked until the count is confirmed, and the missing case leaves stock.
// Uses only a test van "QA Van …"; remove it afterwards with tests/db/cleanup.sql.
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
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const TOMORROW = addDays(TODAY, 1)
async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}
const stockOf = async (v: string) => (await rest(`stock?select=on_hand&variant_id=eq.${v}`))[0].on_hand as number

test('Leftover on the truck: counted next morning, locked until confirmed, missing case written off', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const VAN = `QA Van ${String(Date.now()).slice(-5)}`
  const van = (await rest('vehicle', { method: 'POST', body: JSON.stringify({ name: VAN, capacity_cases: 20 }) }))[0]
  expect(van?.id).toBeTruthy()
  const p1: string = await rpc('trip_open', { p_vehicle: van.id, p_date: TODAY })
  const sting = ((await rpc('trip_detail', { p_plan: p1 })).items as { variant_id: string; label: string; godown: number }[]).find((i) => i.label === 'Sting PET 250ml (Red)')!
  expect(sting.godown).toBeGreaterThanOrEqual(6)
  const s0 = await stockOf(sting.variant_id)
  // evening of day 1 (through the database): load 4, nothing sold, all 4 come back and stay on the truck
  await rpc('trip_load', { p_plan: p1, p_driver: null, p_lines: [{ variant_id: sting.variant_id, qty: 4 }] })
  await rpc('trip_unload', { p_plan: p1, p_returned: [{ variant_id: sting.variant_id, qty: 4 }], p_keep: true })
  expect(await stockOf(sting.variant_id)).toBe(s0)

  await login(page)
  await page.goto(`/admin/loading?date=${TOMORROW}`)
  const card = page.getByTestId('trip-card').filter({ hasText: VAN })
  await expect(card.getByTestId('card-carry')).toContainText('4 cases left on the truck', { timeout: 20_000 })
  await card.getByRole('button', { name: `Load ${VAN}` }).click()

  // the leftover box is shown and pre-filled into the load
  await expect(page.getByTestId('carry-card')).toContainText('Yesterday\'s leftover on the truck: 4 cases')
  await expect(page.getByLabel(`Cases of ${sting.label}`)).toHaveValue('4')
  const loadBtn = page.getByTestId('load-bar').getByRole('button', { name: `Load ${VAN}` })
  await expect(loadBtn).toBeDisabled()                                   // locked until the count is confirmed
  await page.getByRole('button', { name: `One less On the truck: ${sting.label}` }).click()   // loader finds only 3
  await expect(page.getByTestId('carry-card')).toContainText('1 missing')
  await expect(page.getByLabel(`Cases of ${sting.label}`)).toHaveValue('3')                     // load follows the real count
  await page.getByTestId('carry-ok').check()
  await expect(loadBtn).toBeEnabled()
  await loadBtn.click()
  await expect(page.getByText(`${VAN} loaded: 3 cases left the godown.`)).toBeVisible({ timeout: 20_000 })

  // the missing case left stock; the truck leftover is used up
  expect(await stockOf(sting.variant_id)).toBe(s0 - 1 - 3)
  const board = (await rpc('trip_board', { p_date: TOMORROW })) as { vehicle: string; carry: number }[]
  expect(board.find((b) => b.vehicle === VAN)!.carry).toBe(0)
  expect(errors).toEqual([])
})
