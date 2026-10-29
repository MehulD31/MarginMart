import { expect, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'

export const PIN = '482915'
export const ACCOUNTS = {
  admin: '9000000101', manager: '9000000102', driver: '9000000103', shop: '9000000104', newShop: '9000000105',
} as const

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
export const SUPABASE_URL = env.VITE_SUPABASE_URL
export const ANON = env.VITE_SUPABASE_ANON_KEY

export const isPhone = (info: TestInfo) => info.project.name === 'phone'

/** Collects page errors so every test can assert the console stayed clean. */
export function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  return errors
}

export async function login(page: Page, phone: string, pin = PIN) {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByLabel('6-digit PIN').fill(pin)
  await page.getByRole('button', { name: 'Log in' }).click()
  if (pin === PIN) await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

/** Signs in through the Edge Function and returns an access token, for API-level permission checks. */
export async function token(phone: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/pin-login`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin: PIN }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error(`login failed for ${phone}: ${JSON.stringify(j)}`)
  return j.access_token
}

export async function rest(tok: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init, headers: { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) },
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

export async function fn(tok: string, name: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

/** Shared checks for any screen: no sideways scroll, labelled inputs, named buttons. */
export async function screenIsSound(page: Page, where: string) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  const vw = page.viewportSize()!.width
  expect(width, `${where}: page is ${width}px wide on a ${vw}px screen`).toBeLessThanOrEqual(vw)
  const problems = await page.evaluate(() => {
    const out: string[] = []
    const visible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')) {
      const i = el as HTMLInputElement
      const named = i.labels?.length || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby')
      if (!named && visible(i)) out.push(`unlabelled ${i.tagName.toLowerCase()}[${i.type || ''}]`)
    }
    for (const el of document.querySelectorAll('button, a.button')) {
      const name = (el.textContent ?? '').trim() || el.getAttribute('aria-label')
      if (!name && visible(el)) out.push(`unnamed button: ${el.outerHTML.slice(0, 80)}`)
    }
    return out
  })
  expect(problems, `${where}: accessibility`).toEqual([])
}
