// Website voice sale: the browser records from a fake mic playing a Hindi clip, the LIVE /api/voice-sale hears and reads it,
// and the New sale form is prefilled. Then Save makes one bill (deleted again at the end). Make clips first: tests/voice/make-clips.ps1
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const U = env.VITE_SUPABASE_URL, A = env.VITE_SUPABASE_ANON_KEY
const H = (t?: string) => ({ apikey: A, Authorization: `Bearer ${t ?? A}`, 'Content-Type': 'application/json' })
async function token() { return (await (await fetch(`${U}/functions/v1/pin-login`, { method: 'POST', headers: H(), body: JSON.stringify({ phone: '8871565551', pin: '1234' }) })).json()).access_token as string }
async function rpc(fn: string, args: unknown) { const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(await token()), body: JSON.stringify(args) }); return r.json().catch(() => null) }
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const PROD = 'https://kdfoods.vercel.app'
const CLIP = resolve('tests/voice/clips/c1.wav')

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${CLIP}%noloop`] } })
test.describe.configure({ mode: 'serial' })

async function open(page: Page) {
  // The dev server has no /api: send the call to the live function (real Gemini, real parser).
  await page.route('**/api/voice-sale', async (route) => {
    const res = await route.fetch({ url: `${PROD}/api/voice-sale`, timeout: 60_000 })
    await route.fulfill({ response: res })
  })
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill('8871565551')
  await page.getByLabel('4-digit PIN').fill('1234')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
  await page.goto('/admin/sales')
  await page.getByRole('button', { name: 'New sale' }).click()
}

test('Speak the sale: Hindi clip fills shop, Sting 50 @495; Save makes one bill', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const before = (await rpc('counter_catalog', {}) as { label: string; on_hand: number }[]).find((c) => c.label === 'Sting PET 250ml (Red)')!.on_hand
  await open(page)
  await page.getByRole('button', { name: 'Speak the sale' }).click()
  await expect(page.getByText(/Listening/)).toBeVisible()
  await page.waitForTimeout(6000)
  await page.getByRole('button', { name: 'Stop and fill' }).click()
  await expect(page.getByText(/Heard: /)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Shri Maruti Kirana', { exact: true })).toBeVisible()
  const line = page.getByTestId('sale-line')
  await expect(line).toHaveCount(1)
  await expect(line).toContainText('Sting PET 250ml')
  await expect(line.getByLabel(/^Rate: /)).toHaveValue('495')
  await expect(page.getByText('₹24,750').first()).toBeVisible()

  await page.getByRole('button', { name: 'Save sale' }).click()
  const saved = page.getByText(/^Saved KD-\d+/)
  await expect(saved).toBeVisible({ timeout: 20_000 })
  const number = (await saved.innerText()).match(/KD-\d+/)![0]
  const bills = (await rpc('counter_sales', { p_from: TODAY, p_to: TODAY }) as { id: string; number: string; total_paise: number }[] | null) ?? []
  const bill = bills.find((b) => b.number === number)
  expect(bill?.total_paise).toBe(2475000)
  const after = (await rpc('counter_catalog', {}) as { label: string; on_hand: number }[]).find((c) => c.label === 'Sting PET 250ml (Red)')!.on_hand
  expect(after).toBe(before - 50)
  await rpc('admin_delete', { p_kind: 'counter_sale', p_id: bill!.id })
  expect(errors).toEqual([])
})

test('Typed fallback fills two items and UPI; mic blocked shows a clear message', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('blocked', 'NotAllowedError')) })
  await open(page)
  await page.getByLabel('Or type the sale').fill('maruti kirana sting 10 peti 500, nimbooz 5 peti 515 upi')
  await page.getByRole('button', { name: 'Fill' }).click()
  await expect(page.getByText(/Heard: /)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('sale-line')).toHaveCount(2)
  await expect(page.getByRole('radio', { name: 'UPI' })).toBeChecked()
  await page.getByRole('button', { name: 'Speak the sale' }).click()
  await expect(page.getByText(/Microphone is blocked/)).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).last().click()
})
