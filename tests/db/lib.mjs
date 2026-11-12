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

/**
 * Test-only product and shop (owner rule: tests never write to real stock or real shops).
 * "QA Test Drink" is a hidden pack (active = false, so no catalogue, shop app or Products page shows it) with one
 * flavour and a price on the active price list. "QA Test Shop" is inactive. Both are kept between runs and reused;
 * only QA records ever touch them. `req(path, init)` is a REST call that returns parsed JSON.
 */
export async function qaFixture(req, routeId) {
  let pack = (await req('pack?select=id&name_en=eq.QA%20Test%20Drink'))[0]
  if (!pack) {
    const brand = (await req('brand?select=id&limit=1'))[0]
    pack = (await req('pack', { method: 'POST', body: JSON.stringify({ brand_id: brand.id, name_en: 'QA Test Drink', units_per_case: 24, mrp_paise: 2000, active: false }) }))[0]
  }
  let variant = (await req(`variant?select=id&pack_id=eq.${pack.id}`))[0]
  if (!variant) variant = (await req('variant', { method: 'POST', body: JSON.stringify({ pack_id: pack.id, flavour_en: 'QA Test Drink' }) }))[0]
  const list = (await req('price_list?select=id&status=eq.active'))[0]
  if (list && !(await req(`price_list_item?select=pack_id&pack_id=eq.${pack.id}&price_list_id=eq.${list.id}`)).length)
    await req('price_list_item', { method: 'POST', body: JSON.stringify({ price_list_id: list.id, pack_id: pack.id, trade_price_paise: 50000 }) })
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
