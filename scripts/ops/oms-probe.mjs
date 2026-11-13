// One-off, READ-ONLY check of how the Pepsi portal answers a second login while a session is already open (our own test session only).
// Run: ops.yml mode=omsprobe. Nothing is read or saved from the portal.
const B = 'https://oms.rjcorp.in/v1/api/'
const login = async (u, p, take) => {
  const r = await fetch(B + 'auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p, loginCurrentSystem: take }) })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, response: j.response, message: j.message, hasToken: !!j.token, token: j.token, keys: Object.keys(j).join(',') }
}
const show = (name, x) => console.log(name, JSON.stringify({ status: x.status, response: x.response, message: x.message, hasToken: x.hasToken, keys: x.keys }))

export async function probeOms({ env }) {
  const u = env('OMS_USER'), p = env('OMS_PASS')
  const a = await login(u, p, true)            // session A, like the sync today
  show('A (takeover=true)', a)
  try {
    const b = await login(u, p, false)         // a second login that does NOT take over
    show('B (takeover=false while A is open)', b)
    if (b.token) await fetch(B + 'auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: b.token }, body: '{}' }).catch(() => null)
  } finally {
    if (a.token) await fetch(B + 'auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: a.token }, body: '{}' }).catch(() => null)
  }
  const c = await login(u, p, false)           // nothing open now: must succeed without taking over
  show('C (takeover=false, nothing open)', c)
  if (c.token) await fetch(B + 'auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: c.token }, body: '{}' }).catch(() => null)
}
