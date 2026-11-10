// Scheme bot, step 1: a Pepsi message -> facts (AI) + our numbers (from the app) + Hinglish explanation + poster + buttons.
// Env (plus lib.mjs): TASK = the message text, WHO = Telegram name.  Run: node scripts/scheme-bot/explain.mjs
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { addDays, askJson, db, env, hiDate, rs, say, tgPhoto, todayIST, upload } from './lib.mjs'

const task = env('TASK').slice(0, 2000)
const who = process.env.WHO ?? ''
const today = todayIST()

try {
  // ---- what we sell, with the shop's current TS per case (MRP value − trade price) ----
  const [packs, variants, prices, stock] = await Promise.all([
    db('pack?select=id,name_en,units_per_case,mrp_paise&active=eq.true'),
    db('variant?select=id,pack_id,flavour_en,image_path&active=eq.true&order=sort'),
    db('price_list_item?select=pack_id,trade_price_paise,price_list!inner(status)&price_list.status=eq.active'),
    db('stock?select=variant_id,on_hand,avg_cost_paise'),
  ])
  const trade = new Map(prices.map((p) => [p.pack_id, p.trade_price_paise]))
  const catalog = packs.filter((p) => trade.has(p.id)).map((p) => ({
    pack_id: p.id, name: p.name_en, bottles: p.units_per_case, mrp: p.mrp_paise / 100, trade: trade.get(p.id) / 100,
    current_ts: (p.units_per_case * p.mrp_paise - trade.get(p.id)) / 100,
    flavours: variants.filter((v) => v.pack_id === p.id).map((v) => ({ id: v.id, name: v.flavour_en })),
  }))

  // ---- AI reads the message. It only extracts facts; every number we show is computed below. ----
  const facts = await askJson(`You help K.D. Foods, a Pepsi beverages dealer in Durg-Bhilai, India (cold drinks only, no snacks: Pepsi, 7UP, Mirinda, Mountain Dew, Sting, Slice, Tropicana, Nimbooz, Aquafina, Gatorade, plus Creambell milk drinks). A Pepsi salesman sent this message (Hindi/Hinglish):
"""${task}"""
Today is ${today} (IST). "TS" = trade scheme = the shop's total margin per case (MRP value of the case minus price paid).
"₹80 TS" on a pack whose current TS is ₹70 means ₹10 extra per case. "N din ke liye" = valid N days starting today unless a date is given (last day = today + N - 1).
Our catalogue (JSON): ${JSON.stringify(catalog)}
Return ONLY JSON:
{"is_scheme": bool, "pack_id": "<id from catalogue or null>", "variant_ids": [ids] or null (null = all flavours of the pack),
 "extra_per_case_rupees": number or null, "starts_on": "YYYY-MM-DD" or null, "ends_on": "YYYY-MM-DD" or null,
 "pepsi_pays": true/false/null (true if Pepsi funds it, which is normal for TS/scheme messages),
 "matlab": "2-3 short Hinglish lines explaining the message simply, no invented numbers",
 "questions": ["Hinglish questions to ask the Pepsi salesman about anything unclear (who pays, exact dates, which flavours)"]}
Never invent a pack, amount or date that the message does not support; use null and add a question instead.`)

  if (!facts.is_scheme) { await say(`🤔 Ye scheme message nahi laga.\n\n${facts.matlab ?? ''}`); process.exit(0) }

  const pack = catalog.find((p) => p.pack_id === facts.pack_id)
  const amount = Math.round(Number(facts.extra_per_case_rupees) * 100)
  let starts = facts.starts_on ?? today
  let ends = facts.ends_on
  const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '')
  const problems = []
  if (!pack) problems.push('product samajh nahi aaya')
  if (!(amount > 0 && amount <= 100000)) problems.push('₹ chhoot pakki nahi')
  if (!ok(starts) || !ok(ends) || ends < starts || ends > addDays(today, 60)) problems.push('tareekh pakki nahi')
  const vids = Array.isArray(facts.variant_ids) && facts.variant_ids.length && pack
    ? facts.variant_ids.filter((id) => pack.flavours.some((f) => f.id === id)) : null
  const qs = (facts.questions ?? []).filter(Boolean)

  if (problems.length) {
    await say(`📩 Pepsi message samjha, par poster nahi banaya: ${problems.join(', ')}.\n\nMatlab: ${facts.matlab ?? ''}\n\n${qs.length ? 'Pepsi se poochho:\n• ' + qs.join('\n• ') : ''}\n\nJawab milne par message dobara bhejo (ya is message ka reply karke sahi baat likho).`)
    process.exit(0)
  }

  // ---- our numbers, straight from the app ----
  const flv = vids ? pack.flavours.filter((f) => vids.includes(f.id)) : pack.flavours
  const ids = flv.map((f) => f.id)
  const st = stock.filter((s) => ids.includes(s.variant_id))
  const onHand = st.reduce((a, s) => a + s.on_hand, 0)
  const buy = st.length ? Math.round(st.reduce((a, s) => a + s.avg_cost_paise * Math.max(s.on_hand, 1), 0) / st.reduce((a, s) => a + Math.max(s.on_hand, 1), 0)) : null
  const since = addDays(today, -30)
  const sold = await db(`delivery_line?select=qty_delivered,invoice!inner(created_at)&variant_id=in.(${ids.join(',')})&invoice.created_at=gte.${since}`).catch(() => [])
  const perDay = sold.reduce((a, l) => a + l.qty_delivered, 0) / 30
  const days = Math.round((new Date(ends) - new Date(starts)) / 86_400_000) + 1
  const need = Math.max(0, Math.ceil(perDay * days * 1.5) - onHand)  // 1.5x: offers sell faster
  const pepsiPays = facts.pepsi_pays !== false
  const tradeP = Math.round(pack.trade * 100)

  // ---- save the draft, then poster + message ----
  const [draft] = await db('scheme_draft', { method: 'POST', body: JSON.stringify({ source_text: task, telegram_from: who,
    facts: { pack_id: pack.pack_id, variant_ids: vids, kind: pepsiPays ? 'pass_through' : 'our_discount', amount_paise: amount, starts_on: starts, ends_on: ends,
      note: `Pepsi: ${task.slice(0, 200)}` } }) })

  const img = (p) => `${env('SUPABASE_URL')}/storage/v1/object/public/product-images/${p}`
  const vmap = new Map(variants.map((v) => [v.id, v]))
  const poster = { amount: String(amount / 100), product: pack.name.replace(/ All Flavours$/i, ''), flavours: flv.map((f) => f.name),
    images: ids.map((id) => vmap.get(id)?.image_path).filter(Boolean).slice(0, 4).map(img),
    valid: `सिर्फ़ ${hiDate(ends)} तक`, validSub: days === 1 ? 'सिर्फ़ आज' : `${days} दिन का ऑफ़र`,
    note: `${pack.bottles} बोतल की पेटी • MRP ₹${pack.mrp}` }
  fs.writeFileSync('poster.json', JSON.stringify(poster))
  execFileSync('node', ['scripts/poster/render.mjs', 'poster.json', 'poster.jpg'], { stdio: 'inherit' })
  // Keep the poster online so an approved scheme can be posted to Facebook/Instagram later (approve.mjs queues it).
  await upload(`posters/${draft.id}.jpg`, 'poster.jpg').catch((e) => console.log('poster upload failed', e.message))

  const lines = [
    `📢 ${pack.name}${vids ? ' (' + flv.map((f) => f.name).join(', ') + ')' : ''}: ${rs(amount)}/peti extra, ${hiDate(starts)}–${hiDate(ends)} (${days} din)`,
    '', `Matlab: ${facts.matlab}`, '',
    'Hamare liye:',
    `• Stock: ${onHand} peti${buy ? ` · buy ${rs(buy)} · trade ${rs(tradeP)}` : ''}`,
    pepsiPays ? `• Pepsi deti hai → hamara buy bhi ${rs(amount)} kam, margin same rahega; shop ko ${rs(tradeP - amount)}/peti` : `• Hum dete hain → hamara margin ${rs(amount)}/peti kam`,
    perDay > 0 ? `• Pichhle 30 din: ~${perDay.toFixed(1)} peti/din → ${days} din ke liye ~${need} peti aur mangao` : '• Pichhle 30 din ki bikri nahi hai, order apne andaaze se karo',
    ...(qs.length ? ['', 'Pepsi se poochho:', ...qs.map((q) => '• ' + q)] : []),
    '', '✅ Approve = app me scheme chalu (in dates me order rate kam). Galat ho to is message ka reply karke sahi likho.',
  ]
  await tgPhoto('poster.jpg', lines.join('\n'), { inline_keyboard: [[{ text: '✅ Approve', callback_data: `ok:${draft.id}` }, { text: '❌ Chhodo', callback_data: `no:${draft.id}` }]] })
} catch (e) {
  console.error(e)
  await say(`⚠️ Scheme bot me error aaya: ${String(e.message).slice(0, 300)}`).catch(() => {})
  process.exit(1)
}
