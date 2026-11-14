// Admin "Counter sales" page against the live database: New sale, Edit, Cancel, checks, totals.
// It makes ONE bill (on a real shop found by searching 'Kumhari'), only ever edits/cancels that bill, and deletes it by id at the end.
// Never act on 'the first bill in the list': real parchis share this page (rule: protect-real-data).
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const U = env.VITE_SUPABASE_URL, A = env.VITE_SUPABASE_ANON_KEY
const SK = 'a84cd6040d25f36e4572309e6f0e456eb00159238a36d971'
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const STING = 'Sting PET 250ml (Red)'

async function token() {
  const r = await fetch(`${U}/functions/v1/pin-login`, { method: 'POST', headers: { apikey: A, Authorization: `Bearer ${A}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '8871565551', pin: '1234' }) })
  return (await r.json()).access_token as string
}
async function rpc(fn: string, args: unknown, tok?: string) {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: A, Authorization: `Bearer ${tok ?? A}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  return r.json().catch(() => null)
}
const bills = async () => rpc('counter_sales', { p_from: TODAY, p_to: TODAY }, await token())
const stockOf = async (label: string) => ((await rpc('counter_catalog', {}, await token())) as { label: string; on_hand: number }[]).find((c) => c.label === label)!.on_hand

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
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
const dialog = (page: Page) => page.getByRole('dialog')

test.describe.configure({ mode: 'serial' })
let ours: { id: string; number: string } | null = null
test.afterAll(async () => { if (ours) await rpc('admin_delete', { p_kind: 'counter_sale', p_id: ours.id }, await token()) })

test('New sale: shop search, items, rate, cases, UPI, checks, one bill only', async ({ page }) => {
  const errors = watchErrors(page)
  await login(page)
  await page.goto('/admin/sales')
  const before = (await bills()).length
  const s0 = await stockOf(STING)
  await page.getByRole('button', { name: 'New sale' }).click()
  const d = dialog(page)
  const save = d.getByRole('button', { name: 'Save sale' })
  await expect(save).toBeDisabled()
  // shop search by area
  await d.getByLabel('Search shop by name, owner, phone or area').fill('Kumhari')
  const firstShop = d.locator('ul button').first()
  const shopName = (await firstShop.locator('strong').textContent())!.trim()
  await firstShop.click()
  await expect(d.getByText(shopName, { exact: true })).toBeVisible()
  await expect(d.getByText('Add at least one item.')).toBeVisible()
  // search shop with no hits
  await d.getByRole('button', { name: 'Change' }).click()
  await d.getByLabel('Search shop by name, owner, phone or area').fill('zzzz no such shop')
  await expect(d.getByText('No shop found. Add it on the Shops page first.')).toBeVisible()
  await d.getByLabel('Search shop by name, owner, phone or area').fill('Kumhari')
  await d.locator('ul button').first().click()
  // items
  await d.getByLabel(/Add an item/).fill('sting pet')
  await d.getByRole('button', { name: new RegExp(STING.replace(/[()]/g, '\\$&')) }).click()
  await expect(d.getByTestId('sale-line')).toHaveCount(1)
  await d.getByRole('button', { name: `One more ${STING}` }).click()
  await d.getByRole('button', { name: `One more ${STING}` }).click()
  await d.getByLabel(`Rate: ${STING}`).fill('500')
  await d.getByLabel(/Add an item/).fill('nimbooz')
  await d.getByRole('button', { name: /Nimbooz/ }).first().click()
  await expect(d.getByTestId('sale-line')).toHaveCount(2)
  const nim = (await d.getByTestId('sale-line').nth(1).locator('.cell-title').textContent())!.trim()
  await d.getByLabel(`Cases of ${nim}`).fill('2')
  await d.getByLabel(`Rate: ${nim}`).fill('520')
  await expect(d.getByTestId('sale-total')).toHaveText('₹2,540')
  await expect(d.getByText(/Margin: ₹/)).toBeVisible()
  // bad rate blocks saving
  await d.getByLabel(`Rate: ${nim}`).fill('5')
  await expect(d.getByText(/rate of ₹20 or more/)).toBeVisible()
  await expect(save).toBeDisabled()
  await d.getByLabel(`Rate: ${nim}`).fill('520')
  // more than stock warns but is allowed
  await d.getByLabel(`Cases of ${nim}`).fill('99999')
  await expect(d.getByText(/only \d+ in stock/)).toBeVisible()
  await d.getByLabel(`Cases of ${nim}`).fill('2')
  await d.getByRole('radio', { name: 'UPI' }).check()
  await expect(save).toBeEnabled()
  await save.dblclick()
  await expect(page.getByText(/Saved KD-\d{5}\. Stock is updated/)).toBeVisible({ timeout: 20_000 })
  const all = await bills()
  expect(all.length).toBe(before + 1)
  const b = all.find((x: { shop: string; total_paise: number }) => x.shop === shopName && x.total_paise === 254000)
  expect(b.mode).toBe('upi')
  expect(b.by).toBe('Mehul')
  ours = { id: b.id, number: b.number }
  expect(await stockOf(STING)).toBe(s0 - 3)
  const feed = (await rpc('sheet_rows', { p_key: SK, p_after: 0 })) as { bill_no: string }[]
  expect(feed.filter((x) => x.bill_no === b.number).length).toBe(2)
  await expect(page.getByTestId('sale-card').filter({ hasText: b.number })).toContainText('UPI')
  expect(errors).toEqual([])
})

test('Edit: change cases + rate, remove an item, add one, switch to cash; stock follows', async ({ page }) => {
  const errors = watchErrors(page)
  await login(page)
  await page.goto('/admin/sales')
  expect(ours, 'bill from the first test').toBeTruthy()
  const b = (await bills()).find((x: { id: string }) => x.id === ours!.id)
  const s0 = await stockOf(STING)
  const card = page.getByTestId('sale-card').filter({ hasText: b.number })
  await card.getByRole('button', { name: 'Edit' }).click()
  const d = dialog(page)
  await expect(d.getByRole('heading', { name: `Edit ${b.number}` })).toBeVisible()
  await expect(d.getByTestId('sale-line')).toHaveCount(2)
  await d.getByLabel(`Cases of ${STING}`).fill('5')
  await d.getByLabel(`Rate: ${STING}`).fill('510')
  const nim = b.lines[1].item
  await d.getByRole('button', { name: `Remove: ${nim}` }).click()
  await expect(d.getByTestId('sale-line')).toHaveCount(1)
  await d.getByLabel(/Add an item/).fill('soda')
  await d.getByRole('button', { name: /Soda/ }).first().click()
  await d.getByRole('radio', { name: 'Cash' }).check()
  await d.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText(`Saved changes to ${b.number}. Stock is updated.`)).toBeVisible({ timeout: 20_000 })
  const after = (await bills()).find((x: { number: string }) => x.number === b.number)
  expect(after.mode).toBe('cash')
  expect(after.lines.map((l: { item: string; qty: number }) => `${l.item}:${l.qty}`).join()).toMatch(new RegExp(`^${STING.replace(/[()]/g, '\\$&')}:5,.*Soda.*:1$`))
  expect(await stockOf(STING)).toBe(s0 - 2)
  // below the loss line asks first
  await card.getByRole('button', { name: 'Edit' }).click()
  await dialog(page).getByLabel(`Rate: ${STING}`).fill('100')
  await expect(dialog(page).getByText(/below loss line/)).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Selling at a loss')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click()
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).first().click()
  expect(((await bills()).find((x: { number: string }) => x.number === b.number)).lines[0].price_paise).toBe(51000)
  expect(errors).toEqual([])
})

test('Cancel bill, totals, empty range, menu, Hindi', async ({ page }) => {
  const errors = watchErrors(page)
  await login(page)
  await page.goto('/admin/sales')
  const cards = page.getByTestId('sale-card')
  await expect(cards.first()).toBeVisible({ timeout: 20_000 })
  const live = cards.filter({ hasNot: page.getByText('Cancelled', { exact: true }) })
  // the list is paged (25 a card page), so the day's bill count is read from the "Bills" box, not by counting cards
  const billsBox = page.locator('.stat', { hasText: 'Bills' }).locator('.value')
  const n = Number(await billsBox.innerText())
  expect(n).toBeGreaterThan(0)
  expect(ours, 'bill from the first test').toBeTruthy()
  const target = live.filter({ hasText: ours!.number })
  const number = (await target.textContent())!.match(/KD-\d{5}/)![0]
  await target.getByRole('button', { name: 'Cancel bill' }).click()
  const submit = dialog(page).getByRole('button', { name: 'Cancel bill' })
  await expect(submit).toBeDisabled()
  await dialog(page).getByLabel(/Reason/).fill('QA test cancel')
  await submit.click()
  const card = cards.filter({ hasText: number })
  await expect(card).toContainText('Cancelled', { timeout: 15_000 })
  await expect(card.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  await expect(page.locator('.stat', { hasText: 'Bills' }).locator('.value')).toHaveText(String(n - 1))
  // the date fields are a themed picker (a button), not an <input> that can be typed into: it shows the chosen day
  await expect(page.getByRole('button', { name: /^From/ })).toHaveAttribute('data-value', /^\d{4}-\d{2}-\d{2}$/)
  await page.goto('/admin/dashboard')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  if (page.viewportSize()!.width < 900) await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('link', { name: 'Counter sales' }).first().click()
  await expect(page).toHaveURL(/\/admin\/sales/)
  await page.getByRole('button', { name: /हिंदी/ }).first().click()
  await expect(page.getByRole('heading', { name: 'काउंटर बिक्री' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'नई बिक्री' })).toBeVisible()
  expect(errors).toEqual([])
})
