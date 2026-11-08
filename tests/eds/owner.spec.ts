// Owner name next to the shop name when adding a sale: search by owner, see "Shop · Owner" in results, on the chosen shop
// and on the saved bill card. Makes its own QA shop + bill and removes the bill (shop removed by tests/db/cleanup.sql).
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const U = env.VITE_SUPABASE_URL, A = env.VITE_SUPABASE_ANON_KEY
const H = (t?: string) => ({ apikey: A, Authorization: `Bearer ${t ?? A}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
async function token() { return (await (await fetch(`${U}/functions/v1/pin-login`, { method: 'POST', headers: H(), body: JSON.stringify({ phone: '8871565551', pin: '1234' }) })).json()).access_token as string }
async function rest(path: string, init: RequestInit = {}) { const r = await fetch(`${U}/rest/v1/${path}`, { ...init, headers: H(await token()) }); return r.json().catch(() => null) }
async function rpc(fn: string, args: unknown) { const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(await token()), body: JSON.stringify(args) }); return r.json().catch(() => null) }

test('New sale: search by owner, owner shown in results, chosen shop and bill card', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const tag = String(Date.now()).slice(-5)
  const SHOP = `QA OWNER Shop ${tag}`, OWNER = `Rameshwar Qa${tag}`
  const route = (await rest('route?select=id&name=eq.Direct%20sales'))[0].id
  await rest('shop', { method: 'POST', body: JSON.stringify({ name: SHOP, owner_name: OWNER, route_id: route }) })

  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
  await page.goto('/admin/sales')
  await page.getByRole('button', { name: 'New sale' }).click()

  await page.getByLabel('Search shop by name, owner, phone or area').fill(`Qa${tag}`)   // owner name only
  const hit = page.getByRole('button', { name: new RegExp(SHOP) })
  await expect(hit).toHaveCount(1)
  await expect(hit).toContainText(`${SHOP} · ${OWNER}`)
  await hit.click()
  await expect(page.getByText(`· ${OWNER}`).first()).toBeVisible()

  await page.getByLabel(/^Add an item/).fill('Sting PET')
  await page.getByRole('button', { name: /Sting PET 250ml/ }).first().click()
  await page.getByLabel(/^Rate: Sting PET 250ml/).fill('500')
  await page.getByRole('button', { name: 'Save sale' }).click()
  const saved = page.getByText(/^Saved KD-\d+/)
  await expect(saved).toBeVisible({ timeout: 20_000 })
  const number = (await saved.innerText()).match(/KD-\d+/)![0]
  const card = page.getByTestId('sale-card').filter({ hasText: number })
  await expect(card).toContainText(`${number} · ${SHOP} · ${OWNER}`)

  // Edit keeps showing the owner on the chosen shop
  await card.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('dialog').getByText(`· ${OWNER}`)).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).last().click()

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const bill = ((await rpc('counter_sales', { p_from: today, p_to: today })) as { id: string; number: string }[]).find((b) => b.number === number)!
  await rpc('admin_delete', { p_kind: 'counter_sale', p_id: bill.id })
  expect(errors).toEqual([])
})
