// "Paid into" + Money with partners, in the browser against the live database. Makes its own QA shop and bill,
// then removes the bill. Ledger/transfer leftovers are removed by tests/db/cleanup.sql (run it after).
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const U = env.VITE_SUPABASE_URL, A = env.VITE_SUPABASE_ANON_KEY
const H = (t?: string) => ({ apikey: A, Authorization: `Bearer ${t ?? A}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
async function token() { return (await (await fetch(`${U}/functions/v1/pin-login`, { method: 'POST', headers: H(), body: JSON.stringify({ phone: '8871565551', pin: '1234' }) })).json()).access_token as string }
async function rest(path: string, init: RequestInit = {}) { const r = await fetch(`${U}/rest/v1/${path}`, { ...init, headers: H(await token()) }); return r.json().catch(() => null) }
async function rpc(fn: string, args: unknown) { const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(await token()), body: JSON.stringify(args) }); return r.json().catch(() => null) }
const rs = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })
type Holding = { account_id: string; name: string; holding_paise: number }
const shobhit = async () => ((await rpc('money_holdings', {})) as Holding[]).find((h) => h.name.startsWith('Shobhit'))!

test.describe.configure({ mode: 'serial' })

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

test('UPI sale paid into Shobhit -> badge, holding, change account, moved to company, undo', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const tag = String(Date.now()).slice(-5)
  const SHOP = `QA MONEY UI ${tag}`
  const route = (await rest('route?select=id&name=eq.Direct%20sales'))[0].id
  await rest('shop', { method: 'POST', body: JSON.stringify({ name: SHOP, route_id: route }) })
  const before = (await shobhit()).holding_paise
  await login(page)

  // New sale: UPI into Shobhit's account
  await page.goto('/admin/sales')
  await page.getByRole('button', { name: 'New sale' }).click()
  await page.getByLabel('Search shop by name, owner, phone or area').fill(SHOP)
  await page.getByRole('button', { name: new RegExp(SHOP) }).click()
  await page.getByLabel(/^Add an item/).fill('Sting PET')
  await page.getByRole('button', { name: /Sting PET 250ml/ }).first().click()
  await page.getByLabel(/^Rate: Sting PET 250ml/).fill('495')
  await page.getByRole('radio', { name: 'UPI' }).check()
  const paidInto = page.getByLabel('Paid into')
  await expect(paidInto.locator('option:checked')).toHaveText(/Company bank \(default\)/)
  await paidInto.selectOption({ label: 'Shobhit (personal)' })
  await page.getByRole('button', { name: 'Save sale' }).click()
  const saved = page.getByText(/^Saved KD-\d+/)
  await expect(saved).toBeVisible({ timeout: 20_000 })
  const number = (await saved.innerText()).match(/KD-\d+/)![0]
  const card = page.getByTestId('sale-card').filter({ hasText: number })
  await expect(card.getByTestId('paid-into')).toHaveText('→ Shobhit (personal)')
  expect((await shobhit()).holding_paise).toBe(before + 49500)

  // Edit keeps the account
  await card.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByLabel('Paid into').locator('option:checked')).toHaveText('Shobhit (personal)')
  await page.getByRole('button', { name: 'Cancel' }).last().click()

  // Money page: holding card, row, change account
  await page.goto('/admin/money')
  await expect(page.getByRole('heading', { name: 'Money with partners', level: 1 })).toBeVisible()
  const hold = page.getByTestId('holding').filter({ hasText: 'Shobhit (personal)' })
  await expect(hold).toContainText(rs(before + 49500))
  const row = page.getByTestId('money-row').filter({ hasText: number })
  const sel = row.getByRole('combobox')
  await expect(sel.locator('option:checked')).toHaveText('Shobhit (personal)')
  await sel.selectOption({ label: 'Company bank' })
  await expect(page.getByText(`Saved: ${number} · ${SHOP} paid into Company bank.`)).toBeVisible({ timeout: 15_000 })
  await expect(hold).toContainText(rs(before))
  await sel.selectOption({ label: 'Shobhit (personal)' })
  await expect(hold).toContainText(rs(before + 49500), { timeout: 15_000 })

  // CSV for the CA
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV for the CA' }).click()
  const csv = readFileSync(await (await dl).path(), 'utf8')
  expect(csv).toContain(`${number},${SHOP},upi,495,Shobhit (personal),personal`)

  // Moved to company: more than held is blocked, then move ₹400
  await hold.getByRole('button', { name: 'Moved to company' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Amount (₹)').fill(String((before + 49500) / 100 + 1))
  await expect(dlg.getByRole('button', { name: 'Save' })).toBeDisabled()
  await dlg.getByLabel('Amount (₹)').fill('400')
  await dlg.getByLabel(/Note/).fill('QA move')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Recorded: ₹400 moved to the company bank.')).toBeVisible({ timeout: 15_000 })
  await expect(hold).toContainText(rs(before + 9500))
  const tr = page.getByTestId('transfer').filter({ hasText: 'QA move' }).first()
  await expect(tr).toContainText('₹400')

  // Undo the move
  await tr.getByRole('button', { name: 'Undo' }).click()
  await page.getByRole('dialog').getByLabel(/Reason/).fill('qa test')
  await page.getByRole('dialog').getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('Move undone.')).toBeVisible({ timeout: 15_000 })
  await expect(hold).toContainText(rs(before + 49500))

  // the page is in the menu (sidebar on laptop, "More" on phone)
  if (test.info().project.name === 'laptop') await expect(page.getByRole('link', { name: 'Money with partners' })).toBeVisible()

  // clean up the bill (stock goes back)
  const bill = ((await rpc('money_payments', { p_from: null, p_to: null })) as { ref_id: string; number: string }[]).find((p) => p.number === number)!
  await rpc('admin_delete', { p_kind: 'counter_sale', p_id: bill.ref_id })
  expect((await shobhit()).holding_paise).toBe(before)
  expect(errors).toEqual([])
})
