// KD Foods autopilot (thumb rule: the business runs itself). Runs in GitHub Actions (.github/workflows/ops.yml).
//   MODE=morning   08:00 IST  today's trucks + orders, low stock, overdue khata
//   MODE=night     21:30 IST  today's sales/cases/cash/margin + closing check (truck not closed, cash short/not received)
//   MODE=weekly    Mon 09:00  last 7 days vs the week before, best items, biggest dues
//   MODE=watchdog  10:00 + 23:00  re-sends a missing report, checks backup, Telegram webhook, failed workflow runs
//   MODE=social    19:30 IST  posts the next approved scheme poster to Facebook + Instagram (if the page is connected)
//   MODE=ask       QUESTION="..."  answers an owner's /ask from the live numbers (free Gemini key)
// Every job writes public.ops_log (job, key). A re-run of the same day sees the row and does nothing (FORCE=1 overrides).
import { askJson, db, env, rs, say, todayIST, addDays } from '../scheme-bot/lib.mjs'

const MODE = env('MODE'); const FORCE = process.env.FORCE === '1' || process.env.FORCE === 'true'
const today = todayIST()
const rpc = (fn, args) => db(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
const done = async (job, key) => !FORCE && (await db(`ops_log?job=eq.${job}&key=eq.${encodeURIComponent(key)}&select=job`)).length > 0
const mark = (job, key, detail = null, status = 'ok') => db('ops_log?on_conflict=job,key', { method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ job, key, status, detail }) })
const item = (s) => { const w = String(s).split(' '); const h = w.length / 2; return h % 1 === 0 && w.slice(0, h).join(' ') === w.slice(h).join(' ') ? w.slice(0, h).join(' ') : s }
const n = (x) => Number(x ?? 0)
const hi = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

async function morning() {
  if (await done('morning', today)) return console.log('morning already sent')
  const d = await rpc('ops_daily', { p_day: today })
  let plans = []
  try { plans = await db(`route_day_plan?date=eq.${today}&select=status,route(name),orders(status)`) } catch (e) { console.log('plans', e.message) }
  const L = [`☀️ Good morning, ${hi(today)}`]
  const live = plans.map((p) => ({ name: p.route?.name ?? '?', status: p.status, orders: (p.orders ?? []).filter((o) => o.status !== 'cancelled').length }))
  if (live.length) { L.push('', '🚚 Aaj ke truck:'); for (const p of live) L.push(`• ${p.name}: ${p.orders} order · ${p.status}`) }
  else L.push('', '🚚 Aaj koi route plan nahi.')
  if (d.stock.low.length) { L.push('', `📦 Kam stock (${d.stock.low.length}):`); for (const s of d.stock.low.slice(0, 10)) L.push(`• ${item(s.item)}: ${s.on_hand} peti`) ; L.push('→ Pepsi ko aaj order bhejo.') }
  if (n(d.dues.overdue_paise) > 0) {
    L.push('', `💰 Overdue khata ${rs(n(d.dues.overdue_paise))} (kul udhaar ${rs(n(d.dues.total_paise))}, ${d.dues.shops} dukan):`)
    for (const s of d.dues.top.filter((x) => n(x.overdue) > 0).slice(0, 6)) L.push(`• ${s.name}${s.locality ? ' · ' + s.locality : ''}: ${rs(n(s.overdue))}`)
    L.push('→ Driver aaj inse vasooli kare.')
  } else if (n(d.dues.total_paise) > 0) L.push('', `💰 Udhaar ${rs(n(d.dues.total_paise))} (${d.dues.shops} dukan), koi overdue nahi.`)
  await say(L.join('\n'))
  await mark('morning', today)
}

async function night() {
  if (await done('night', today)) return console.log('night already sent')
  const d = await rpc('ops_daily', { p_day: today })
  const c = d.counter, r = d.route
  const cases = n(c.cases) + n(r.cases)
  const L = [`🌙 Aaj ka hisaab, ${hi(today)}`, '',
    `📦 Kul ${cases} peti · ${rs(n(c.total_paise) + n(r.total_paise))}`,
    `• Counter: ${c.bills} bill, ${c.cases} peti, ${rs(n(c.total_paise))} (cash ${rs(n(c.cash_paise))}, UPI ${rs(n(c.upi_paise))})`,
    `• Route: ${r.bills} bill, ${r.cases} peti, ${rs(n(r.total_paise))}`,
    `• Vasooli: cash ${rs(n(d.collected.cash_paise))}, UPI ${rs(n(d.collected.upi_paise))}`,
    `• Counter margin: ${rs(n(c.margin_paise))}`]
  if (n(c.below_cost_lines) > 0) L.push(`⚠️ ${c.below_cost_lines} line buy price se kam pe biki. Counter sales page me dekho.`)
  if (d.top_items.length) L.push('', '🏆 Sabse zyada: ' + d.top_items.map((t) => `${item(t.item)} ${t.cases}`).join(', '))
  const probs = []
  for (const t of d.trucks) {
    if (['loaded', 'out'].includes(t.status) && !t.closed) probs.push(`${t.route}: truck abhi tak close nahi hua`)
    else if (t.closed && !t.cash_received) probs.push(`${t.route}: cash ${rs(n(t.handed_cash_paise))} abhi receive nahi kiya`)
    if (t.closed && n(t.handed_cash_paise) < n(t.expected_cash_paise)) probs.push(`${t.route}: cash ${rs(n(t.expected_cash_paise) - n(t.handed_cash_paise))} kam`)
  }
  if (probs.length) L.push('', '🚨 Closing:', ...probs.map((p) => '• ' + p))
  if (d.open_orders_tomorrow) L.push('', `📝 Kal ke ${d.open_orders_tomorrow} order taiyaar. Loading sheet subah check karo.`)
  try {
    const a = await askJson(`You advise the owner of K.D. Foods, a PepsiCo distributor (Durg-Bhilai, India). Today's numbers (paise = rupees x100):\n${JSON.stringify(d)}\n` +
      'Give ONE short practical action for tomorrow in Hinglish (max 25 words), based only on these numbers. If the day is empty, suggest following up dues or stock. JSON: {"tip": "..."}')
    if (a?.tip) L.push('', `💡 ${String(a.tip).slice(0, 200)}`)
  } catch (e) { console.log('tip skipped', e.message) }
  await say(L.join('\n'))
  await mark('night', today, { cases })
}

async function weekly() {
  if (await done('weekly', today)) return console.log('weekly already sent')
  const w = await rpc('ops_weekly', { p_end: addDays(today, -1) })
  const days = w.days ?? []
  const sum = (f) => days.reduce((a, d) => a + f(d), 0)
  const cases = sum((d) => n(d.counter.cases) + n(d.route.cases))
  const prev = n(w.prev_week_counter_cases) + n(w.prev_week_route_cases)
  const best = days.reduce((b, d) => (n(d.counter.cases) + n(d.route.cases) > (b ? n(b.counter.cases) + n(b.route.cases) : -1) ? d : b), null)
  const items = new Map(); for (const d of days) for (const t of d.top_items) items.set(item(t.item), (items.get(item(t.item)) ?? 0) + n(t.cases))
  const L = [`📊 Hafte ka report (${hi(days[0]?.day ?? today)}–${hi(days.at(-1)?.day ?? today)})`, '',
    `📦 ${cases} peti${prev ? ` (pichhla hafta ${prev}, ${cases >= prev ? '+' : ''}${Math.round(((cases - prev) / prev) * 100)}%)` : ''}`,
    `💵 Bikri ${rs(sum((d) => n(d.counter.total_paise) + n(d.route.total_paise)))} · vasooli ${rs(sum((d) => n(d.collected.cash_paise) + n(d.collected.upi_paise)))}`,
    `📈 Counter margin ${rs(sum((d) => n(d.counter.margin_paise)))}`,
    `🏪 Nayi dukan: ${w.new_shops}`]
  if (best && cases) L.push(`⭐ Best din: ${hi(best.day)} (${n(best.counter.cases) + n(best.route.cases)} peti)`)
  if (items.size) L.push('', '🏆 Top: ' + [...items].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', '))
  const t = w.today
  L.push('', `💰 Udhaar ${rs(n(t.dues.total_paise))} · overdue ${rs(n(t.dues.overdue_paise))}`)
  for (const s of t.dues.top.slice(0, 5)) L.push(`• ${s.name}: ${rs(n(s.balance))}`)
  await say(L.join('\n'))
  await mark('weekly', today, { cases })
}

// ---------- GitHub (watchdog) ----------
const gh = async (path, init = {}) => {
  const r = await fetch(`https://api.github.com/repos/${env('GITHUB_REPOSITORY')}/${path}`, { ...init,
    headers: { Authorization: `Bearer ${env('GH_TOKEN')}`, Accept: 'application/vnd.github+json', ...(init.headers ?? {}) } })
  if (!r.ok && r.status !== 204) throw new Error(`github ${r.status} ${path}: ${(await r.text()).slice(0, 200)}`)
  return r.status === 204 ? null : r.json()
}
const istMinutes = () => { const t = new Date(Date.now() + 330 * 60000); return t.getUTCHours() * 60 + t.getUTCMinutes() }

async function watchdog() {
  const alerts = []
  // 1. reports that should have gone out by now (re-sent here; the functions are idempotent)
  const m = istMinutes()
  for (const [job, at, fn] of [['morning', 8 * 60 + 45, morning], ['night', 22 * 60, night]]) {
    if (m >= at && !(await done(job, today))) {
      try { await fn(); alerts.push(`${job} report nahi gaya tha, ab bhej diya`) } catch (e) { alerts.push(`${job} report fail: ${e.message.slice(0, 120)}`) }
    }
  }
  // 2. nightly backup ran and succeeded in the last 26 h
  try {
    const runs = (await gh('actions/workflows/backup.yml/runs?per_page=3')).workflow_runs ?? []
    const ok = runs.find((r) => r.conclusion === 'success' && Date.now() - Date.parse(r.created_at) < 26 * 3600e3)
    if (!ok && !(await done('backup-retry', today))) {
      await gh('actions/workflows/backup.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) })
      await mark('backup-retry', today)
      alerts.push('raat ka backup nahi mila, dobara chala diya')
    }
  } catch (e) { alerts.push(`backup check fail: ${e.message.slice(0, 120)}`) }
  // 3. Telegram webhook health (the /sale and scheme bot depend on it)
  try {
    const r = await (await fetch(`https://api.telegram.org/bot${env('KD_BOT_TOKEN')}/getWebhookInfo`)).json()
    const w = r.result ?? {}
    if (!w.url) alerts.push('Telegram webhook band hai (bot jawab nahi dega)')
    else if (w.last_error_date && Date.now() / 1000 - w.last_error_date < 6 * 3600) alerts.push(`bot webhook error: ${String(w.last_error_message).slice(0, 100)}`)
    if (n(w.pending_update_count) > 10) alerts.push(`bot ke ${w.pending_update_count} message atke hain`)
  } catch (e) { alerts.push(`webhook check fail: ${e.message.slice(0, 100)}`) }
  // 4. any failed workflow run in the last 24 h (each run reported once)
  try {
    const since = new Date(Date.now() - 24 * 3600e3).toISOString()
    const runs = (await gh(`actions/runs?status=failure&per_page=20&created=>${since}`)).workflow_runs ?? []
    for (const r of runs) {
      if (await done('failalert', String(r.id))) continue
      alerts.push(`❌ ${r.name} fail hua (${new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })})`)
      await mark('failalert', String(r.id))
    }
  } catch (e) { alerts.push(`run check fail: ${e.message.slice(0, 100)}`) }
  // 5. social queue stuck (page connected but posts keep failing)
  try {
    const stuck = await db('social_post?status=eq.failed&select=id,error&limit=1')
    if (stuck.length && !(await done('social-stuck', today))) { alerts.push(`social post fail: ${String(stuck[0].error).slice(0, 120)}`); await mark('social-stuck', today) }
  } catch (e) { console.log('social check', e.message) }
  console.log('watchdog', alerts)
  if (alerts.length) await say('🛠 Watchdog:\n' + alerts.map((a) => '• ' + a).join('\n'))
  await mark('watchdog', `${today}-${m < 15 * 60 ? 'am' : 'pm'}`, { alerts })
}

// ---------- Social: Facebook Page + Instagram (Graph API) ----------
const G = 'https://graph.facebook.com/v23.0'
const graph = async (path, params) => {
  const r = await fetch(`${G}/${path}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: env('META_PAGE_TOKEN') }) })
  const j = await r.json(); if (j.error) throw new Error(`${path}: ${j.error.message}`); return j
}
async function social() {
  const [p] = await db('social_post?status=eq.queued&order=created_at&limit=1&select=*')
  if (!p) return console.log('nothing queued')
  const page = process.env.FB_PAGE_ID, ig = process.env.IG_USER_ID
  if (!process.env.META_PAGE_TOKEN || (!page && !ig)) {
    if (!(await done('social-noconnect', today))) {
      await say('📣 Approved scheme poster post hone ke liye taiyaar hai, par Facebook/Instagram page abhi connect nahi hai. Page banne ke baad GitHub secrets META_PAGE_TOKEN, FB_PAGE_ID, IG_USER_ID daalo; phir ye apne aap post hoga.')
      await mark('social-noconnect', today)
    }
    return
  }
  const patch = (b) => db(`social_post?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify(b) })
  const out = { attempts: p.attempts + 1 }
  try {
    if (page && !p.fb_post_id) out.fb_post_id = (await graph(`${page}/photos`, { url: p.image_url, caption: p.caption })).post_id ?? 'ok'
    if (ig && !p.ig_media_id) {
      const c = await graph(`${ig}/media`, { image_url: p.image_url, caption: p.caption })
      for (let i = 0; i < 10; i++) {
        const s = await (await fetch(`${G}/${c.id}?fields=status_code&access_token=${env('META_PAGE_TOKEN')}`)).json()
        if (s.status_code === 'FINISHED') break
        if (s.status_code === 'ERROR') throw new Error('instagram media error')
        await new Promise((r) => setTimeout(r, 5000))
      }
      out.ig_media_id = (await graph(`${ig}/media_publish`, { creation_id: c.id })).id
    }
    await patch({ ...out, status: 'posted', posted_at: new Date().toISOString(), error: null })
    await say(`📣 Scheme poster post ho gaya${out.fb_post_id ? ' · Facebook' : ''}${out.ig_media_id ? ' · Instagram' : ''}.`)
  } catch (e) {
    await patch({ ...out, error: e.message.slice(0, 300), status: out.attempts >= 3 ? 'failed' : 'queued' })
    throw e
  }
}

async function ask() {
  const q = env('QUESTION').slice(0, 800)
  const [d, y, w] = await Promise.all([rpc('ops_daily', { p_day: today }), rpc('ops_daily', { p_day: addDays(today, -1) }), rpc('ops_weekly', { p_end: today })])
  const a = await askJson(`You are the operations assistant of K.D. Foods (PepsiCo distributor, Durg-Bhilai). Answer the owner's question using ONLY this live data. Money is in paise (divide by 100 for rupees, write as ₹). If the data can't answer it, say so and say which app page has it.\n` +
    `TODAY ${JSON.stringify(d)}\nYESTERDAY ${JSON.stringify(y)}\nLAST 7 DAYS ${JSON.stringify(w.days)}\n\nQuestion: ${q}\n\nReply in short Hinglish (max 120 words). JSON: {"reply": "..."}`)
  await say(`🤖 ${String(a?.reply ?? 'Jawab nahi bana, dobara poochho.').slice(0, 3500)}`)
}

const jobs = { morning, night, weekly, watchdog, social, ask }
if (!jobs[MODE]) throw new Error(`unknown MODE ${MODE}`)
try { await jobs[MODE]() } catch (e) {
  console.error(e)
  await say(`⚠️ Autopilot "${MODE}" me error: ${String(e.message).slice(0, 300)}`).catch(() => {})
  process.exit(1)
}
