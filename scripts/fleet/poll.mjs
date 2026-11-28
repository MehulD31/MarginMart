// Live vehicle poller (owner, 28 Nov 2026). Reads the Euler Shepherd web API with the owner's login (GitHub secrets EULER_USER /
// EULER_PASS) and writes public.fleet_vehicle (now) + public.fleet_point (route). READ ONLY on Euler's side: it never calls the
// start/stop/lock commands. Started every hour by pg_cron (/api/tick?mode=fleet -> .github/workflows/fleet.yml); runs ~57 minutes,
// one reading a minute. Alerts (low battery, moving at night) go to the KD Telegram group once each (ops_log).
import { db, env, tg } from '../scheme-bot/lib.mjs'
import { alertsFor, isNewPoint, parseRvd } from './fleet.mjs'

const B = 'https://shepherd.eulermotors.com/api/'
const H = { client: 'web', 'Content-Type': 'application/json', Origin: 'https://shepherd.eulermotors.com' }
const RUN_MIN = Number(process.env.RUN_MINUTES || 57), EVERY_S = Number(process.env.EVERY_SECONDS || 60)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const say = (text) => tg('sendMessage', { chat_id: env('KD_CHAT_ID'), text, disable_web_page_preview: true })
const done = async (job, key) => (await db(`ops_log?job=eq.${job}&key=eq.${encodeURIComponent(key)}&select=job`)).length > 0
const mark = (job, key, detail = null) => db('ops_log?on_conflict=job,key', { method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ job, key, status: 'ok', detail }) })
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)

let token = null
async function login() {
  const auth = Buffer.from(`${env('EULER_USER').trim()}:${env('EULER_PASS').trim()}`).toString('base64')
  for (let i = 0; i < 3; i++) {
    const r = await fetch(B + 'v3/user-login', { method: 'POST', headers: { ...H, Authorization: `Basic ${auth}` }, body: '{}' }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }))
    if (r.ok) { const j = await r.json(); if (j.token) return (token = j.token) }
    if (r.status === 401 || r.status === 403) throw new Error(`Euler login refused (${r.status}): password badla?`)
    await sleep(5000 * (i + 1))
  }
  throw new Error('Euler login failed 3 times')
}
async function get(path, q = {}) {
  const u = new URL(B + path); for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v)
  for (let i = 0; i < 2; i++) {
    const r = await fetch(u, { headers: { ...H, Authorization: token } })
    if (r.status === 401 || r.status === 403) { await login(); continue }
    if (!r.ok) throw new Error(`Euler ${path} ${r.status}`)
    return r.json()
  }
  throw new Error(`Euler ${path}: still unauthorised after login`)
}

async function alertOnce(job, key, text) {
  if (await done(job, key)) return
  await say(text)
  await mark(job, key, text.slice(0, 200))
}

async function main() {
  try { await login() } catch (e) {
    await alertOnce('fleet-login-fail', today(), `⚠️ Euler (gaadi tracking) login fail: ${e.message}. Website pe live location update nahi hogi.`)
    throw e
  }
  const end = Date.now() + RUN_MIN * 60000
  let list = [], listAt = 0, fails = 0
  const seen = new Map((await db('fleet_vehicle?select=imei,seen_at')).map((r) => [r.imei, r.seen_at]))
  const names = new Map()
  while (Date.now() < end) {
    const t0 = Date.now()
    try {
      if (!list.length || t0 - listAt > 15 * 60000) {
        list = (await get('user-vehicles')).vehicles ?? []; listAt = t0
        const ours = await db('fleet_vehicle?select=imei,vehicle:vehicle_id(name)')
        for (const o of ours) names.set(o.imei, o.vehicle?.name)
      }
      for (const v of list) {
        const row = parseRvd(await get('v6/rvd', { imei: v.imei }), { imei: v.imei, euler_id: v.id, reg_no: v.v_reg_num, model: v.v_model })
        if (!row.imei) continue
        await db('fleet_vehicle?on_conflict=imei', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) })
        if (isNewPoint(seen.get(row.imei), row)) {
          await db('fleet_point?on_conflict=imei,at', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
            body: JSON.stringify({ imei: row.imei, at: row.seen_at, lat: row.lat, lng: row.lng, speed: row.speed, soc: row.soc }) })
          seen.set(row.imei, row.seen_at)
        }
        const label = names.get(row.imei) ? `${names.get(row.imei)} (${row.reg_no})` : row.reg_no
        for (const a of alertsFor({ ...row, label })) await alertOnce(a.job, a.key, a.text)
      }
      fails = 0
    } catch (e) {
      fails++
      console.log('tick failed', e.message)
      if (fails === 5) await alertOnce('fleet-poll-fail', today(), `⚠️ Gaadi tracking 5 minute se update nahi ho rahi: ${e.message.slice(0, 150)}`)
    }
    await sleep(Math.max(1000, EVERY_S * 1000 - (Date.now() - t0)))
  }
  console.log(`fleet poll done: ${list.length} vehicles`)
}
await main()
