// New sale: discount box (₹) and "+ New shop" (all 4 fields required, shop picked straight away). Live database;
// bills are deleted at the end, QA shops are removed by tests/db/cleanup.sql.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const U = env.VITE_SUPABASE_URL, A = env.VITE_SUPABASE_ANON_KEY
const H = (t?: string) => ({ apikey: A, Authorization: `Bearer ${t ?? A}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
async function token() { return (await (await fetch(`${U}/functions/v1/pin-login`, { method: 'POST', headers: H(), body: JSON.stringify({ phone: '8871565551', pin: '1234' }) })).json()).access_token as string }
async function rest(path: string) { const r = await fetch(`${U}/rest/v1/${path}`, { headers: H(await token()) }); return r.json().catch(() => null) }
async function rpc(fn: string, args: unknown) { const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(await token()), body: JSON.stringify(args) }); return r.json().catch(() => null) }
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

async function newSale(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
  await page.goto('/admin/sales')
  await page.getByRole('button', { name: 'New sale' }).click()
}

test('New shop from the sale screen + discount: total, card and margin', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const tag = String(Date.now()).slice(-5)
  const SHOP = `QA NEW Shop ${tag}`, OWNER = `Suresh Qa${tag}`, PHONE = '6' + String(Date.now()).slice(-9)
  await newSale(page)

  // + New shop: all four fields required
  await page.getByLabel('Search shop by name, owner, phone or area').fill(SHOP)
  await page.getByRole('button', { name: 'New shop' }).click()
  const f = page.getByTestId('new-shop-form')
  await expect(f.getByLabel(/Shop name/)).toHaveValue(SHOP)               // what was typed in search carries over
  // a typo gets a one-tap fix
  await f.getByLabel(/Shop name/).fill(`${SHOP} Daily Needa`)
  await f.getByTestId('name-hint').getByRole('button', { name: `${SHOP} Daily Needs` }).click()
  await expect(f.getByLabel(/Shop name/)).toHaveValue(`${SHOP} Daily Needs`)
  await expect(f.getByTestId('name-hint')).toHaveCount(0)
  await f.getByLabel(/Shop name/).fill(SHOP)
  const save = f.getByRole('button', { name: 'Add shop and use it' })
  await expect(save).toBeDisabled()
  await f.getByLabel(/Owner name/).fill(OWNER)
  await f.getByLabel(/Mobile number/).fill('12345')
  await expect(f.getByText(/10-digit mobile number/)).toBeVisible()
  await expect(save).toBeDisabled()
  await f.getByLabel(/Mobile number/).fill(PHONE)
  await expect(save).toBeDisabled()                                       // area still empty
  await f.getByLabel(/Area/).fill('Supela')
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByText(`· ${OWNER}`).first()).toBeVisible({ timeout: 15_000 })   // picked for the sale
  const row = (await rest(`shop?select=name,owner_name,phone,locality,route(name)&phone=eq.${PHONE}`))[0]
  expect(row).toMatchObject({ name: SHOP, owner_name: OWNER, phone: PHONE, locality: 'Supela', route: { name: 'Direct sales' } })

  // items + discount
  await page.getByLabel(/^Add an item/).fill('Sting PET')
  await page.getByRole('button', { name: /Sting PET 250ml/ }).first().click()
  await page.getByLabel(/^Rate: Sting PET 250ml/).fill('500')
  const sub = 500                                                         // a new line starts at 1 case
  const disc = page.getByLabel('Discount (₹)')
  await disc.fill(String(sub + 1))
  await expect(page.getByText('Discount must be a rupee amount, not more than the items total.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save sale' })).toBeDisabled()
  await disc.fill('95')
  await expect(page.getByTestId('sale-total')).toHaveText('₹' + (sub - 95).toLocaleString('en-IN'))
  await page.getByRole('button', { name: 'Save sale' }).click()
  const saved = page.getByText(/^Saved KD-\d+/)
  await expect(saved).toBeVisible({ timeout: 20_000 })
  const number = (await saved.innerText()).match(/KD-\d+/)![0]
  const card = page.getByTestId('sale-card').filter({ hasText: number })
  await expect(card.getByTestId('sale-discount')).toHaveText('Discount (₹): −₹95')
  const bill = ((await rpc('counter_sales', { p_from: TODAY, p_to: TODAY })) as { id: string; number: string; total_paise: number; discount_paise: number }[]).find((b) => b.number === number)!
  expect(bill.total_paise).toBe((sub - 95) * 100)
  expect(bill.discount_paise).toBe(9500)

  // edit keeps the discount
  await card.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByLabel('Discount (₹)')).toHaveValue('95')
  await page.getByRole('button', { name: 'Cancel' }).last().click()

  await rpc('admin_delete', { p_kind: 'counter_sale', p_id: bill.id })
  expect(errors).toEqual([])
})

test('New shop: phone already used by another shop is refused with its name', async ({ page }) => {
  const existing = (await rest('shop?select=name,phone&phone=not.is.null&active=eq.true&limit=1'))[0]
  await newSale(page)
  await page.getByRole('button', { name: 'New shop' }).click()
  const f = page.getByTestId('new-shop-form')
  await f.getByLabel(/Shop name/).fill('QA DUP Shop')
  await f.getByLabel(/Owner name/).fill('QA Owner')
  await f.getByLabel(/Mobile number/).fill(existing.phone)
  await f.getByLabel(/Area/).fill('Supela')
  await f.getByRole('button', { name: 'Add shop and use it' }).click()
  await expect(f.getByText(`This number already belongs to ${existing.name}.`, { exact: false })).toBeVisible({ timeout: 15_000 })
  expect((await rest('shop?select=id&name=eq.QA%20DUP%20Shop')).length).toBe(0)
  await f.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'New shop' })).toBeVisible()
})
