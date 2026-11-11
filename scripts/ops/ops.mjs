// KD Foods autopilot (thumb rule: the business runs itself). Runs in GitHub Actions (.github/workflows/ops.yml).
//   MODE=morning   08:00 IST  plan: trucks, schemes, low stock + a Pepsi order text, overdue khata with tap-to-remind links
//   MODE=night     21:30 IST  day's sales/cases/cash/margin + closing check (truck not closed, cash short/not received) + company money held by partners + a tip
//   MODE=weekly    Mon 09:00  last 7 days vs the week before, best items, biggest dues, sleeping shops
//   MODE=events    every ~10 min  new join request, new shop order, item out of stock, partner holding company money 7+ days, website down (each alerted once)
//   MODE=month     1st 09:30  last month's sales register + payments (with 'paid into') as a CSV file for the accountant
//   MODE=watchdog  10:00 + 23:00  re-sends a missing report, backup, bot webhook, failed runs, website, free-tier size
//   MODE=social    19:30 IST  next approved scheme poster -> Telegram channel (if set) and Facebook + Instagram (if connected)
//   MODE=ask       QUESTION="..."  answers an owner's /ask from the live numbers (free Gemini key)
// Every job writes public.ops_log (job, key). A re-run of the same thing sees the row and does nothing (FORCE=1 overrides).
import { askJson, db, env, rs, say, tg, todayIST, addDays } from '../scheme-bot/lib.mjs'
import { item, monthRange, reorderText, remindText, toCsv, waLink } from './format.mjs'
import { dayText, weekText, smartText } from './report.mjs'
import { captionPrompt, fallbackCaption, finishCaption, previewButtons, waShare } from './media.mjs'
import { randomUUID } from 'node:crypto'
import { analyze, factsForAI } from '../../src/shared/insights.js'
const smart = async () => { try { return analyze(await rpc('ops_insights', { p_days: 90 })) } catch (e) { console.log('insights', e.message); return null } }

const MODE = env('MODE'); const FORCE = process.env.FORCE === '1' || process.env.FORCE === 'true'
const today = todayIST()
const rpc = (fn, args = {}) => db(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
const done = async (job, key) => !FORCE && (await db(`ops_log?job=eq.${job}&key=eq.${encodeURIComponent(key)}&select=job`)).length > 0
const mark = (job, key, detail = null, status = 'ok') => db('ops_log?on_conflict=job,key', { method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ job, key, status, detail }) })
const n = (x) => Number(x ?? 0)
const hi = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const istTime = (iso) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })

async function tgDoc(filename, text, caption) {
  const fd = new FormData()
  fd.append('chat_id', env('KD_CHAT_ID'))
  fd.append('document', new Blob([text], { type: 'text/csv' }), filename)
  if (caption) fd.append('caption', caption.slice(0, 1000))
  const r = await (await fetch(`https://api.telegram.org/bot${env('KD_BOT_TOKEN')}/sendDocument`, { method: 'POST', body: fd })).json()
  if (!r.ok) throw new Error(`telegram sendDocument: ${JSON.stringify(r).slice(0, 200)}`)
}

async function morning() {
  if (await done('morning', today)) return console.log('morning already sent')
  const [d, over, reorder, schemes] = await Promise.all([
    rpc('ops_daily', { p_day: today }), rpc('ops_overdue', { p_limit: 6 }), rpc('ops_reorder', { p_cover_days: 7 }), rpc('ops_schemes')])
  let plans = []
  try { plans = await db(`route_day_plan?date=eq.${today}&select=status,route(name),orders(status)`) } catch (e) { console.log('plans', e.message) }
  const L = [`☀️ Good morning, ${hi(today)}`]
  const live = plans.map((p) => ({ name: p.route?.name ?? '?', status: p.status, orders: (p.orders ?? []).filter((o) => o.status !== 'cancelled').length }))
  if (live.length) { L.push('', '🚚 Aaj ke truck:'); for (const p of live) L.push(`• ${p.name}: ${p.orders} order · ${p.status}`) }
  else L.push('', '🚚 Aaj koi route plan nahi.')
  for (const s of schemes) {
    const tag = s.starts_today ? '🆕 Aaj se scheme' : s.days_left === 0 ? '⏰ Scheme aaj khatam' : '⏰ Scheme kal khatam'
    L.push(`${tag}: ${item(s.pack)} ${rs(n(s.amount_paise))}/peti`)
  }
  if (reorder.length) {
    L.push('', `📦 Stock kam / jaldi khatam (${reorder.length}):`)
    for (const s of reorder.slice(0, 8)) L.push(`• ${item(s.item)}: ${s.on_hand} peti${s.days_left != null ? ` (~${s.days_left} din)` : ''}`)
  }
  if (n(d.dues.overdue_paise) > 0) {
    L.push('', `💰 Overdue khata ${rs(n(d.dues.overdue_paise))} (kul udhaar ${rs(n(d.dues.total_paise))}, ${d.dues.shops} dukan). Link dabao, WhatsApp khulega:`)
    for (const s of over) {
      const link = waLink(s.phone, remindText(s.name, rs(n(s.overdue))))
      L.push(`• ${s.name}${s.locality ? ' · ' + s.locality : ''}: ${rs(n(s.overdue))}${link ? '\n  ' + link : ''}`)
    }
    L.push('→ Driver aaj inse vasooli kare.')
  } else if (n(d.dues.total_paise) > 0) L.push('', `💰 Udhaar ${rs(n(d.dues.total_paise))} (${d.dues.shops} dukan), koi overdue nahi.`)
  try { const inv = await rpc('invite_batch', { p_limit: 1000 }); const left = inv?.[0]?.left_count ?? 0; if (left > 0) L.push('', `📣 WhatsApp group: ${left} dukan ko invite bhejna baki. Dashboard > Invite shops (aaj 50).`) } catch (e) { console.log('invite', e.message) }
  await say(L.join('\n'))
  const ins = await smart()
  const st = ins && smartText(ins, waLink)
  if (st) await say(st)
  if (reorder.length) await say(`📝 Pepsi ko ye order bhej do (7 din ka stock, pichhle 30 din ki bikri se):\n\n${reorderText(reorder, hi(today))}`)
  await mark('morning', today)
}

async function night() {
  if (await done('night', today)) return console.log('night already sent')
  const d = await rpc('ops_daily', { p_day: today })
  const { text, cases } = dayText(d)
  let tip = ''
  try {
    const a = await askJson(`You advise the owner of K.D. Foods, a Pepsi beverages dealer in Durg-Bhilai, India (drinks, water and milk drinks, no snacks: Pepsi, 7UP, Mirinda, Mountain Dew, Sting, Slice, Tropicana, Nimbooz, Aquafina, Gatorade, plus Creambell milk drinks). Today's numbers (paise = rupees x100):\n${JSON.stringify(d)}\n` +
      'Give ONE short practical action for tomorrow in Hinglish (max 25 words), based only on these numbers. If the day is empty, suggest following up dues or stock. JSON: {"tip": "..."}')
    if (a?.tip) tip = `\n\n💡 ${String(a.tip).slice(0, 200)}`
  } catch (e) { console.log('tip skipped', e.message) }
  // Company money still in a partner's personal account / the cash box ("Paid into" on bills and payments).
  let money = ''
  try {
    const held = (await rpc('_money_holdings')).filter((h) => n(h.holding_paise) > 0)
    if (held.length) money = '\n\n👤 Company ka paisa abhi: ' + held.map((h) => `${h.name} ${rs(n(h.holding_paise))}`).join(', ') + '. Bank me daal ke website pe "Moved to company" dabao.'
  } catch (e) { console.log('money skipped', e.message) }
  await say(text + money + tip)
  await mark('night', today, { cases })
}

async function weekly() {
  if (await done('weekly', today)) return console.log('weekly already sent')
  const [w, sleeping] = await Promise.all([rpc('ops_weekly', { p_end: addDays(today, -1) }), rpc('ops_sleeping', { p_days: 10 })])
  const { text, cases } = weekText(w, sleeping, waLink)
  await say(text)
  await mark('weekly', today, { cases })
}
// New events, checked every ~10 minutes. Each one is alerted exactly once (ops_log) so a re-run never repeats it.
async function events() {
  // 1. join requests waiting for approval
  const jr = await db('join_requests?status=eq.pending&select=id,shop_name,owner_name,phone,address,created_at&order=created_at&limit=20')
  for (const j of jr) {
    if (await done('join', j.id)) continue
    const link = waLink(j.phone, `Namaste ${j.owner_name ?? ''}, K.D. Foods se. Aapki join request mili. Hum jaldi approve karte hain.`)
    await say(`🆕 Nayi dukan join request\n${j.shop_name} · ${j.owner_name ?? ''}\n📞 ${j.phone}${j.address ? '\n📍 ' + j.address : ''}\n→ App → Join requests me approve karo.${link ? '\n' + link : ''}`)
    await mark('join', j.id)
  }
  // 2. orders placed by shops in the last 24 h
  try {
    const since = new Date(Date.now() - 24 * 3600e3).toISOString()
    const orders = await db(`orders?source=eq.shop&status=neq.cancelled&created_at=gte.${encodeURIComponent(since)}&select=id,created_at,shop(name,locality),route_day_plan(date),order_line(qty_ordered,pack(name_en))&order=created_at&limit=30`)
    for (const o of orders) {
      if (await done('order', o.id)) continue
      const lines = (o.order_line ?? []).map((l) => `• ${item(l.pack?.name_en)}: ${l.qty_ordered}`)
      const tot = (o.order_line ?? []).reduce((a, l) => a + n(l.qty_ordered), 0)
      await say(`🛒 Naya order: ${o.shop?.name ?? '?'}${o.shop?.locality ? ' · ' + o.shop.locality : ''}\n${lines.slice(0, 10).join('\n')}\nKul ${tot} peti · delivery ${o.route_day_plan?.date ? hi(o.route_day_plan.date) : '?'}`)
      await mark('order', o.id)
    }
  } catch (e) { console.log('orders skipped', e.message) }
  // 3. items that just ran out (only items with a low-stock level set). Re-armed when stock comes back.
  try {
    const out = await db('stock?low_threshold=gt.0&on_hand=lte.0&select=variant_id,variant(flavour_en,active,pack(name_en,active))')
    const bought = new Set((await db('stock_move?kind=eq.purchase&select=variant_id')).map((m) => m.variant_id))
    for (const s of out) {
      if (!bought.has(s.variant_id)) continue                    // never bought: not our stock, no alert
      if (!s.variant?.active || !s.variant?.pack?.active || (await done('oos', s.variant_id))) continue
      await say(`🔴 Stock khatam: ${item(`${s.variant.pack.name_en} ${s.variant.flavour_en ?? ''}`)}. Pepsi ko order bhejo.`)
      await mark('oos', s.variant_id)
    }
    const armed = await db('ops_log?job=eq.oos&select=key')
    if (armed.length) {
      const back = await db(`stock?variant_id=in.(${armed.map((a) => a.key).join(',')})&on_hand=gt.0&select=variant_id`)
      if (back.length) await db(`ops_log?job=eq.oos&key=in.(${back.map((b) => b.variant_id).join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    }
  } catch (e) { console.log('stock skipped', e.message) }
  // 4. company money in a personal account for more than 7 days (once a day per account, after 10:00 IST)
  try {
    if (istMinutes() >= 10 * 60) {
      for (const h of await rpc('_money_holdings')) {
        if (h.kind !== 'personal' || n(h.holding_paise) <= 0 || n(h.oldest_days) <= 7 || (await done('money-late', `${today}-${h.account_id}`))) continue
        await say(`⏰ ${h.name} ke account me company ka ${rs(n(h.holding_paise))} hai (${h.payments} payment, sabse purana ${h.oldest_days} din pehle). Company bank me daal do, phir website → "Money with partners" → "Moved to company".`)
        await mark('money-late', `${today}-${h.account_id}`)
      }
    }
  } catch (e) { console.log('money check skipped', e.message) }
  // 5. website down (alerted at most once per 3 hours)
  try {
    const r = await fetch(process.env.SITE_URL || 'https://kdfoods.vercel.app', { signal: AbortSignal.timeout(20000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
  } catch (e) {
    const bucket = `${today}-${Math.floor(istMinutes() / 180)}`
    if (!(await done('site-down', bucket))) { await say(`🔴 Website khul nahi rahi (${String(e.message).slice(0, 80)}). Vercel check karo.`); await mark('site-down', bucket) }
  }
}

// Last month's sales register + payments for the accountant, on the 1st.
async function month() {
  const t = new Date(Date.now() + 330 * 60000)
  const py = t.getUTCMonth() === 0 ? t.getUTCFullYear() - 1 : t.getUTCFullYear(), pm = t.getUTCMonth() === 0 ? 12 : t.getUTCMonth()
  const r = monthRange(py, pm)
  if (await done('month', r.label)) return console.log('month already sent')
  const q = `created_at=gte.${encodeURIComponent(r.from)}&created_at=lt.${encodeURIComponent(r.to)}`
  const [inv, cs, pay, paid] = await Promise.all([
    db(`invoice?${q}&select=number,created_at,total_paise,status,shop(name,gstin)&order=created_at&limit=5000`),
    db(`cash_sale?${q}&select=id,number,created_at,total_paise,payment_mode,voided_at,shop(name)&order=created_at&limit=5000`),
    db(`ledger_entry?${q}&type=eq.payment&select=id,created_at,amount_paise,payment_mode,upi_ref,shop(name)&order=created_at&limit=5000`),
    rpc('_money_payments', { p_from: null, p_to: null }).catch(() => [])])
  // Which account each payment went into (so the accountant sees money that landed in a partner's personal account).
  const into = new Map(paid.map((p) => [`${p.kind}:${p.ref_id}`, p.account ?? '']))
  const day = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const rows = [
    ...inv.map((x) => ({ date: day(x.created_at), kind: 'Route bill', number: x.number, shop: x.shop?.name, gstin: x.shop?.gstin, amount_rs: n(x.total_paise) / 100, mode: '', paid_into: '', status: x.status })),
    ...cs.map((x) => ({ date: day(x.created_at), kind: 'Counter sale', number: x.number, shop: x.shop?.name, gstin: '', amount_rs: n(x.total_paise) / 100, mode: x.payment_mode, paid_into: into.get(`counter_sale:${x.id}`) ?? '', status: x.voided_at ? 'void' : 'ok' })),
    ...pay.map((x) => ({ date: day(x.created_at), kind: 'Payment received', number: x.upi_ref ?? '', shop: x.shop?.name, gstin: '', amount_rs: -n(x.amount_paise) / 100, mode: x.payment_mode, paid_into: into.get(`payment:${x.id}`) ?? '', status: 'ok' })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  const sales = rows.filter((x) => x.kind !== 'Payment received' && x.status !== 'void' && x.status !== 'voided')
  await tgDoc(`kd-foods-${r.label}.csv`, '\uFEFF' + toCsv(['date', 'kind', 'number', 'shop', 'gstin', 'amount_rs', 'mode', 'paid_into', 'status'], rows),
    `📒 ${r.label} ka register: ${sales.length} bill, bikri ${rs(sales.reduce((a, x) => a + x.amount_rs * 100, 0))}, vasooli ${rs(-rows.filter((x) => x.kind === 'Payment received').reduce((a, x) => a + x.amount_rs * 100, 0))}. Accountant ko bhej do.`)
  await mark('month', r.label, { rows: rows.length })
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
      alerts.push(`❌ ${r.name} fail hua (${istTime(r.created_at)})`)
      await mark('failalert', String(r.id))
    }
  } catch (e) { alerts.push(`run check fail: ${e.message.slice(0, 100)}`) }
  // 5. social queue stuck (page connected but posts keep failing)
  try {
    const stuck = await db('social_post?status=eq.failed&select=id,error&limit=1')
    if (stuck.length && !(await done('social-stuck', today))) { alerts.push(`social post fail: ${String(stuck[0].error).slice(0, 120)}`); await mark('social-stuck', today) }
  } catch (e) { console.log('social check', e.message) }
  // 6. free-tier limits: Supabase free = 500 MB database, 1 GB storage (alert at 80%, once a day)
  try {
    const h = await rpc('ops_health')
    const dbMb = n(h.db_bytes) / 1048576, stMb = n(h.storage_bytes) / 1048576
    if ((dbMb > 400 || stMb > 800) && !(await done('size-alert', today))) {
      alerts.push(`Supabase free limit paas: database ${dbMb.toFixed(0)}/500 MB, storage ${stMb.toFixed(0)}/1024 MB`)
      await mark('size-alert', today)
    }
  } catch (e) { alerts.push(`database check fail: ${e.message.slice(0, 100)}`) }
  // 7. the event poller itself is alive (a run in the last 3 h)
  try {
    const runs = (await gh('actions/workflows/ops.yml/runs?per_page=30')).workflow_runs ?? []
    const sched = runs.filter((r) => r.event === 'schedule')
    const recent = sched.some((r) => Date.now() - Date.parse(r.created_at) < 3 * 3600e3)
    // no scheduled run at all yet = the schedule is new (GitHub can take a while to start it), not dead
    if (sched.length && !recent && !(await done('poller-dead', today))) { alerts.push('10-min check 3 ghante se nahi chala (GitHub schedule ruk gaya?)'); await mark('poller-dead', today) }
  } catch (e) { console.log('poller check', e.message) }
  console.log('watchdog', alerts)
  if (alerts.length) await say('🛠 Watchdog:\n' + alerts.map((a) => '• ' + a).join('\n'))
  await mark('watchdog', `${today}-${m < 15 * 60 ? 'am' : 'pm'}`, { alerts })
}

// ---------- Social: Telegram channel + Facebook Page + Instagram (Graph API) ----------
const G = 'https://graph.facebook.com/v23.0'
const graph = async (path, params) => {
  const r = await fetch(`${G}/${path}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: env('META_PAGE_TOKEN') }) })
  const j = await r.json(); if (j.error) throw new Error(`${path}: ${j.error.message}`); return j
}
// One post: Telegram channel (if set), Facebook Page, Instagram. Photos as photos, videos as Reels on both.
async function postOne(p) {
  const patch = (b) => db(`social_post?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify(b) })
  // auto-made and owner posts go out only after the group has seen them (preview, see content.mjs and media())
  if (p.kind !== 'scheme' && !(await db(`ops_log?job=eq.preview&key=eq.${p.id}&select=job`)).length) return console.log('waiting for preview', p.id)
  // an offer that already ended must never go out
  if (p.kind === 'scheme' && p.source_id) {
    const [s] = await db(`scheme?id=eq.${p.source_id}&select=ends_on,active`)
    if (!s || !s.active || s.ends_on < today) { await patch({ status: 'skipped', error: 'scheme ended before posting' }); return console.log('skipped, scheme ended') }
  }
  const video = p.media_type === 'video'
  const channel = process.env.KD_CHANNEL_ID
  if (channel && !(await done('channel', p.id))) {
    await tg(video ? 'sendVideo' : 'sendPhoto', { chat_id: channel, [video ? 'video' : 'photo']: p.image_url, caption: p.caption.slice(0, 1024) })
    await mark('channel', p.id)
  }
  const page = process.env.FB_PAGE_ID, ig = process.env.IG_USER_ID
  if (!process.env.META_PAGE_TOKEN || (!page && !ig)) {
    if (channel) { await patch({ status: 'posted', posted_at: new Date().toISOString() }); return console.log('posted to channel only') }
    if (!(await done('social-noconnect', today))) {
      await say('📣 Approved post taiyaar hai, par Facebook/Instagram page abhi connect nahi hai. GitHub secrets META_PAGE_TOKEN, FB_PAGE_ID, IG_USER_ID daalo; phir ye apne aap post hoga.')
      await mark('social-noconnect', today)
    }
    return
  }
  const out = { attempts: p.attempts + 1 }
  try {
    if (page && !p.fb_post_id) {
      out.fb_post_id = video
        ? (await graph(`${page}/videos`, { file_url: p.image_url, description: p.caption })).id
        : (await graph(`${page}/photos`, { url: p.image_url, caption: p.caption })).post_id ?? 'ok'
    }
    if (ig && !p.ig_media_id) {
      const c = await graph(`${ig}/media`, video
        ? { media_type: 'REELS', video_url: p.image_url, caption: p.caption, share_to_feed: 'true' }
        : { image_url: p.image_url, caption: p.caption })
      // videos take a while to process on Instagram's side (up to ~3 minutes)
      for (let i = 0; i < (video ? 40 : 10); i++) {
        const s = await (await fetch(`${G}/${c.id}?fields=status_code&access_token=${env('META_PAGE_TOKEN')}`)).json()
        if (s.status_code === 'FINISHED') break
        if (s.status_code === 'ERROR') throw new Error('instagram could not process the media')
        await new Promise((r) => setTimeout(r, 5000))
      }
      out.ig_media_id = (await graph(`${ig}/media_publish`, { creation_id: c.id })).id
    }
    await patch({ ...out, status: 'posted', posted_at: new Date().toISOString(), error: null })
    const igLink = out.ig_media_id ? (await (await fetch(`${G}/${out.ig_media_id}?fields=permalink&access_token=${env('META_PAGE_TOKEN')}`)).json()).permalink : null
    const fbLink = out.fb_post_id && out.fb_post_id !== 'ok' ? `https://www.facebook.com/${out.fb_post_id}` : null
    const what = p.kind === 'scheme' ? 'Scheme poster' : video ? 'Video (Reel)' : 'Photo'
    await say(`📣 ${what} post ho gaya${channel ? ' · Telegram channel' : ''}.${fbLink ? `\nFacebook: ${fbLink}` : ''}${igLink ? `\nInstagram: ${igLink}` : ''}`)
    await say(`📲 WhatsApp group mein forward karo (link dabao, group chuno):\n${waShare(p.caption, igLink || fbLink)}`)
  } catch (e) {
    await patch({ ...out, error: e.message.slice(0, 300), status: out.attempts >= 3 ? 'failed' : 'queued' })
    if (out.attempts >= 3) await say(`⚠️ Post nahi ho paya (3 baar try kiya): ${e.message.slice(0, 200)}`)
    throw e
  }
}
// 19:30 job: every approved post (max 5). With POST_ID (⚡ in Telegram): just that one, right now.
async function social() {
  const id = process.env.POST_ID
  const list = await db(id ? `social_post?id=eq.${id}&status=eq.queued&select=*` : 'social_post?status=eq.queued&order=created_at&limit=5&select=*')
  if (!list.length) return console.log('nothing queued')
  let failed = null
  for (const p of list) { try { await postOne(p) } catch (e) { console.log('post failed', p.id, e.message); failed = e } }
  if (failed) throw failed
}

// Owner video/photo from Telegram (api/scheme-tg.js): save it, AI caption, preview in the group with ✅ ⚡ ❌.
async function media() {
  const fileId = env('FILE_ID'), type = process.env.MTYPE === 'image' ? 'image' : 'video'
  const note = process.env.NOTE ?? '', who = process.env.WHO ?? ''
  if (await done('media', fileId)) return console.log('media already handled')
  let f
  try { f = await tg('getFile', { file_id: fileId }) } catch (e) {
    await say(/too big/i.test(e.message) ? '🎬 Video 20 MB se bada hai. Telegram me normal video ki tarah bhejo (file nahi), ya chhota clip bhejo.' : `⚠️ File nahi mili: ${e.message.slice(0, 150)}`)
    return mark('media', fileId, 'download failed', 'failed')
  }
  const buf = Buffer.from(await (await fetch(`https://api.telegram.org/file/bot${env('KD_BOT_TOKEN')}/${f.file_path}`)).arrayBuffer())
  const ext = type === 'video' ? 'mp4' : 'jpg'
  const path = `${today}/${randomUUID()}.${ext}`
  const up = await fetch(`${env('SUPABASE_URL')}/storage/v1/object/social-media/${path}`, { method: 'POST',
    headers: { apikey: env('SUPABASE_SERVICE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_KEY')}`, 'Content-Type': type === 'video' ? 'video/mp4' : 'image/jpeg', 'x-upsert': 'true' }, body: buf })
  if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 200)}`)
  const url = `${env('SUPABASE_URL')}/storage/v1/object/public/social-media/${path}`
  let caption
  try { caption = finishCaption((await askJson(captionPrompt(note, type)))?.caption) } catch (e) { console.log('caption ai', e.message); caption = fallbackCaption(note, type) }
  if (caption.length < 60) caption = fallbackCaption(note, type)
  const [row] = await db('social_post', { method: 'POST', body: JSON.stringify({ kind: 'media', source_id: randomUUID(), media_type: type, image_url: url, caption, status: 'draft', made_by: who || null }) })
  const head = `📣 Naya ${type === 'video' ? 'video (Reel)' : 'photo'} post${who ? ` · ${who}` : ''}:\n\n`
  const tail = '\n\n✏️ Caption badalna ho to is message ka reply karke naya caption likho.'
  await tg(type === 'video' ? 'sendVideo' : 'sendPhoto', { chat_id: env('KD_CHAT_ID'), [type === 'video' ? 'video' : 'photo']: fileId,
    caption: (head + caption).slice(0, 1024 - tail.length) + tail, reply_markup: previewButtons(row.id) })
  await mark('preview', row.id)
  await mark('media', fileId, row.id)
}
async function ask() {
  const q = env('QUESTION').slice(0, 800)
  const [d, y, w, ins] = await Promise.all([rpc('ops_daily', { p_day: today }), rpc('ops_daily', { p_day: addDays(today, -1) }), rpc('ops_weekly', { p_end: today }), smart()])
  const a = await askJson(`You are the operations assistant of K.D. Foods (Pepsi beverages dealer in Durg-Bhilai, India (drinks, water and milk drinks, no snacks: Pepsi, 7UP, Mirinda, Mountain Dew, Sting, Slice, Tropicana, Nimbooz, Aquafina, Gatorade, plus Creambell milk drinks)). Answer the owner's question using ONLY this live data. Money is in paise (divide by 100 for rupees, write as ₹). If the data can't answer it, say so and say which app page has it.\n` +
    `TODAY ${JSON.stringify(d)}\nYESTERDAY ${JSON.stringify(y)}\nLAST 7 DAYS ${JSON.stringify(w.days)}\nINSIGHTS (who buys what, rhythm, stock cover, areas; rupees already formatted) ${ins ? JSON.stringify(factsForAI(ins)) : 'n/a'}\n\nQuestion: ${q}\n\nReply in short Hinglish (max 120 words). JSON: {"reply": "..."}`)
  await say(`🤖 ${String(a?.reply ?? 'Jawab nahi bana, dobara poochho.').slice(0, 3500)}`)
}

// Which chat is the bot actually wired to? Prints names only (no tokens), so the owner can match it with the group they use.
async function diag() {
  const bot = (await (await fetch(`https://api.telegram.org/bot${env('KD_BOT_TOKEN')}/getMe`)).json()).result
  console.log('bot', bot?.username, 'id', bot?.id, 'can_read_all_group_messages', bot?.can_read_all_group_messages)
  const c = await (await fetch(`https://api.telegram.org/bot${env('KD_BOT_TOKEN')}/getChat?chat_id=${encodeURIComponent(env('KD_CHAT_ID'))}`)).json()
  console.log('KD_CHAT_ID chat:', c.ok ? JSON.stringify({ id: c.result.id, type: c.result.type, title: c.result.title, migrated: c.result.migrate_to_chat_id ?? null }) : JSON.stringify(c))
  const n = await (await fetch(`https://api.telegram.org/bot${env('KD_BOT_TOKEN')}/getChatMemberCount?chat_id=${encodeURIComponent(env('KD_CHAT_ID'))}`)).json()
  console.log('members', JSON.stringify(n.result ?? n))
  const w = (await (await fetch(`https://api.telegram.org/bot${env('KD_BOT_TOKEN')}/getWebhookInfo`)).json()).result ?? {}
  console.log('webhook', JSON.stringify({ url: w.url, pending: w.pending_update_count, last_error: w.last_error_message ?? null, last_error_at: w.last_error_date ? new Date(w.last_error_date * 1000).toISOString() : null, allowed_updates: w.allowed_updates ?? null }))
  if (process.env.QUESTION === 'hello') {
    // Fill Telegram's "/" list and post the menu, so the group can start without typing anything.
    const cmds = [['menu', 'Sab buttons'], ['sale', 'Sale likho'], ['aaj', 'Aaj ka hisaab'], ['kal', 'Kal ka hisaab'], ['week', 'Hafte ka report'],
      ['due', 'Udhaar (naam bhi likh sakte ho)'], ['stock', 'Stock (item ka naam bhi)'], ['order', 'Pepsi ko kya mangana hai'],
      ['sleeping', 'Jo dukane order nahi kar rahi'], ['ask', 'Kuch bhi poochho'], ['check', 'System check']]
    for (const scope of [{ type: 'default' }, { type: 'all_group_chats' }]) {
      const r = await tg('setMyCommands', { commands: cmds.map(([command, description]) => ({ command, description })), scope })
      console.log('setMyCommands', scope.type, r)
    }
    const m = await tg('sendMessage', { chat_id: env('KD_CHAT_ID'), text: '👋 Namaste! Main KD Bot hun. Button dabao, ya seedha likho jaise "aaj ka hisaab", "sharma ka udhaar", "sting ka stock".', reply_markup: { inline_keyboard: [
      [{ text: '📊 Aaj ka hisaab', callback_data: 'm:today' }, { text: '📅 Kal ka', callback_data: 'm:yday' }],
      [{ text: '📈 Hafta', callback_data: 'm:week' }, { text: '💰 Udhaar', callback_data: 'm:due' }],
      [{ text: '📦 Kam stock', callback_data: 'm:stock' }, { text: '📝 Pepsi order', callback_data: 'm:order' }],
      [{ text: '😴 Chup dukane', callback_data: 'm:sleeping' }, { text: '🧾 Sale likho', callback_data: 'm:sale' }],
      [{ text: '❓ Kaise use karein', callback_data: 'm:help' }]] } })
    console.log('hello message_id', m.message_id, 'date', new Date(m.date * 1000).toISOString())
  }
}

const jobs = { morning, night, weekly, events, month, watchdog, social, ask, diag, media }
if (!jobs[MODE]) throw new Error(`unknown MODE ${MODE}`)
try { await jobs[MODE]() } catch (e) {
  console.error(e)
  await say(`⚠️ Autopilot "${MODE}" me error: ${String(e.message).slice(0, 300)}`).catch(() => {})
  process.exit(1)
}
