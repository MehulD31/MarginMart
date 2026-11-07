// Small helpers for the live-database test scripts in tests/db. Keys come from .env.local (never committed).
import fs from 'node:fs'

const file = new URL('../../.env.local', import.meta.url)
export const env = Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) if (!env[k]) throw new Error(`.env.local is missing ${k}`)
const U = env.VITE_SUPABASE_URL, A = env.VITE_SUPABASE_ANON_KEY
const h = (t, x = {}) => ({ apikey: A, Authorization: `Bearer ${t ?? A}`, 'Content-Type': 'application/json', ...x })

export const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
export async function call(fn, args, tok) {
  const r = await fetch(`${U}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h(tok), body: JSON.stringify(args) })
  const txt = await r.text(); let body = null
  try { body = txt ? JSON.parse(txt) : null } catch { body = txt }
  return { status: r.status, body }
}
export async function rest(path, tok, init = {}) {
  const r = await fetch(`${U}/rest/v1/${path}`, { ...init, headers: h(tok, { Prefer: 'return=representation' }) })
  return r.json().catch(() => null)
}
export const fnc = async (name, body, tok) => (await fetch(`${U}/functions/v1/${name}`, { method: 'POST', headers: h(tok), body: JSON.stringify(body) })).json()
export async function login(phone, pin) {
  const j = await fnc('pin-login', { phone, pin })
  if (!j.access_token) throw new Error(`login ${phone} failed: ${JSON.stringify(j)}`)
  return j.access_token
}
let pass = 0, fail = 0
export function check(cond, label, extra) {
  if (cond) { pass++; console.log('  ok  ', label) } else { fail++; console.log('  FAIL', label, extra === undefined ? '' : JSON.stringify(extra)) }
}
export function done() { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0) }
