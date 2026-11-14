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
/** Removes every QA/TEST record from the live database (shops, vans, routes, the test item). Test data must never stay. */
export async function cleanupQA() {
  try {
    const r = await call('qa_cleanup', {}, await login('8871565551', '1234'))
    console.log('  qa cleanup', r.status < 300 ? JSON.stringify(r.body) : `FAILED ${JSON.stringify(r.body)}`)
  } catch (e) { console.log('  qa cleanup FAILED', e.message) }
}
export async function done() { console.log(`\n${pass} passed, ${fail} failed`); await cleanupQA(); process.exit(fail ? 1 : 0) }

/**
 * Test-only product and shop (owner rule: tests never write to real stock or real shops).
 * "QA Test Drink" is a hidden pack (active = false, so no catalogue, shop app or Products page shows it) with one
 * flavour and a price on the active price list. "QA Test Shop" is inactive. Both are kept between runs and reused;
 * only QA records ever touch them. `req(path, init)` is a REST call that returns parsed JSON.
 */
export async function qaFixture(req, routeId) {
  // created (with its price, which normal logins cannot write) by the qa_fixture() function; qa_cleanup() removes it again
  const made = await req('rpc/qa_fixture', { method: 'POST', body: '{}' })
  if (!made?.pack_id) throw new Error(`qa_fixture failed: ${JSON.stringify(made)}`)
  const pack = { id: made.pack_id }, variant = { id: made.variant_id }
  let shop = null
  if (routeId) {
    shop = (await req(`shop?select=id,name&name=eq.QA%20Test%20Shop&route_id=eq.${routeId}`))[0]
    if (!shop) shop = (await req('shop', { method: 'POST', body: JSON.stringify({ name: 'QA Test Shop', route_id: routeId, active: false }) }))[0]
  }
  // Sales and orders only accept active items/shops, so switch them on for the run; hide() switches them off again.
  const flip = async (on) => {
    await req(`pack?id=eq.${pack.id}`, { method: 'PATCH', body: JSON.stringify({ active: on }) })
    if (shop) await req(`shop?id=eq.${shop.id}`, { method: 'PATCH', body: JSON.stringify({ active: on }) })
  }
  await flip(true)
  return { packId: pack.id, variantId: variant.id, shop, hide: () => flip(false) }
}
