// The friendly side of the KD bot (imported by api/scheme-tg.js; "_" files are not routes). Everything here answers in
// a second or two straight from Supabase (key-checked bot_* RPCs) and, for questions, the free Gemini key, with no GitHub run.
//   Slash:   /menu /start /help  /aaj (/report) /kal /week  /due [shop]  /stock [item]  /sleeping  /order  /paisa  /ask <q>
//   Plain:   "aaj ka hisaab", "sharma ka udhaar", "sting stock", "kya mangana hai", any business question (see _intent.js)
//   Buttons: m:<menu item>, d:<shop id> (shop card), u:scheme|ask (unsure text), sp:ok|now|fb|no:<id> (post a social post at 19:30 / now / Facebook only + Insta by hand / skip it)
import { detectIntent } from './_intent.js'
import { askJson } from './_sale.js'
import { parseKharcha } from '../src/shared/kharcha.js'
import { dayText, weekText } from '../scripts/ops/report.mjs'
import { idleLowText, item, reorderText, remindText, waLink } from '../scripts/ops/format.mjs'
import { finishCaption, postIdOf } from '../scripts/ops/media.mjs'

const env = new Proxy({}, { get: (_, k) => String(process.env[k] ?? '').trim() })
const rs = (p) => '₹' + (Number(p ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const todayIST = (offsetDays = 0) => new Date(Date.now() + 330 * 60000 + offsetDays * 864e5).toISOString().slice(0, 10)
const hiDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

async function rpc(fn, args) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: env.KD_BOT_KEY, ...args }) })
  const t = await r.text()
  if (!r.ok) { let m = t; try { m = JSON.parse(t).message } catch { /* keep text */ } throw new Error(m || `rpc ${fn} ${r.status}`) }
  return t ? JSON.parse(t) : null
}
const tg = (method, payload) => fetch(`https://api.telegram.org/bot${env.KD_BOT_TOKEN}/${method}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((r) => r.json()).catch(() => null)
const send = (chat, text, buttons) => tg('sendMessage', { chat_id: chat, text: String(text).slice(0, 4000), disable_web_page_preview: true,
  ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) })
const typing = (chat) => tg('sendChatAction', { chat_id: chat, action: 'typing' })
const ago = (iso) => { if (!iso) return 'kabhi nahi'; const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5); return d <= 0 ? 'aaj' : `${d} din pehle` }
const back = [{ text: '🏠 Menu', callback_data: 'm:menu' }]

// ---------- menu ----------
const MENU = [
  [{ text: '📊 Aaj ka hisaab', callback_data: 'm:today' }, { text: '📅 Kal ka', callback_data: 'm:yday' }],
  [{ text: '📈 Hafta', callback_data: 'm:week' }, { text: '💰 Udhaar', callback_data: 'm:due' }],
  [{ text: '📦 Kam stock', callback_data: 'm:stock' }, { text: '📝 Pepsi order', callback_data: 'm:order' }],
  [{ text: '😴 Chup dukane', callback_data: 'm:sleeping' }, { text: '🧾 Sale likho', callback_data: 'm:sale' }],
  [{ text: '👤 Kiske paas paisa', callback_data: 'm:paisa' }, { text: '❓ Kaise use karein', callback_data: 'm:help' }],
]
const COMMANDS = [
  ['menu', 'Sab buttons'], ['sale', 'Sale likho'], ['aaj', 'Aaj ka hisaab'], ['kal', 'Kal ka hisaab'], ['week', 'Hafte ka report'],
  ['due', 'Udhaar (naam bhi likh sakte ho)'], ['stock', 'Stock (item ka naam bhi)'], ['order', 'Pepsi ko kya mangana hai'],
  ['sleeping', 'Jo dukane order nahi kar rahi'], ['paisa', 'Kiske account me company ka paisa'], ['ask', 'Kuch bhi poochho'], ['check', 'System check'],
]
const HELP = [
  'Main KD Foods ka assistant hun. Seedha Hindi/Hinglish me likho, slash zaroori nahi:',
  '',
  '• "aaj ka hisaab" · "kal ka hisaab" · "is hafte ka report"',
  '• "sharma ka udhaar" · "sabka udhaar"',
  '• "sting ka stock" · "kya mangana hai"',
  '• "kaunsi dukan order nahi kar rahi"',
  '• "shobhit ke paas kitna paisa" (/paisa): company ka paisa jo kisi ke personal account me aaya',
  '• Koi bhi sawal: "is hafte sabse zyada kya bika?"',
  '',
  '🧾 Sale: /sale likho (buttons), ya ek line: /sale Sharma Kirana: sting 50 @495, cash. Ya voice note bhejo.',
  '📢 Pepsi scheme: Pepsi wale ka message yahan paste/forward karo → matlab + poster + ✅ Approve.',
  '',
  'Main aapas ki baat-cheet pe jawab nahi deta. Mujhse baat karni ho to "bot ..." se shuru karo ya mere message pe reply karo.',
  'Roz apne aap: 8:00 subah ka plan · 21:30 din ka hisaab · Monday hafte ka report.',
].join('\n')

async function showMenu(chat) {
  tg('setMyCommands', { commands: COMMANDS.map(([command, description]) => ({ command, description })) })  // keeps the "/" list current
  await send(chat, '👋 Kya dekhna hai? Button dabao, ya seedha likho (jaise "sharma ka udhaar").', MENU)
}

// ---------- answers ----------
/** Company money sitting in a partner's personal account or the cash box (from "Paid into" on bills and payments). */
export function paisaText(holdings) {
  const L = ['👤 Company ka paisa kiske paas hai:', '']
  for (const h of holdings) {
    const late = h.kind === 'personal' && Number(h.holding_paise) > 0 && Number(h.oldest_days ?? 0) > 7
    L.push(`• ${h.name}: ${rs(h.holding_paise)}${Number(h.holding_paise) > 0 ? ` (${h.payments} payment, sabse purana ${h.oldest_days ? h.oldest_days + ' din' : 'aaj'})` : ' ✅'}${late ? ' ⚠️ 7 din se zyada' : ''}`)
  }
  if (!holdings.some((h) => Number(h.holding_paise) > 0)) L.push('', 'Sab company bank me hai. 👍')
  else L.push('', 'Company bank me daalne ke baad website → "Money with partners" → "Moved to company" dabao.')
  return L.join('\n')
}
async function paisa(chat) {
  await typing(chat)
  await send(chat, paisaText(await rpc('bot_money_holdings', {})), [back])
}
async function today(chat, offset = 0) {
  await typing(chat)
  const d = await rpc('bot_day', { p_day: todayIST(offset) })
  const title = offset === 0 ? `📊 Aaj ka hisaab (${hiDate(d.day)}, abhi tak)` : `📅 Kal ka hisaab (${hiDate(d.day)})`
  await send(chat, dayText(d, title).text, [[offset === 0 ? { text: '📅 Kal ka', callback_data: 'm:yday' } : { text: '📊 Aaj ka', callback_data: 'm:today' }, { text: '📈 Hafta', callback_data: 'm:week' }], back])
}
async function week(chat) {
  await typing(chat)
  const w = await rpc('bot_week', { p_end: todayIST(-1) })
  await send(chat, weekText(w).text, [[{ text: '😴 Chup dukane', callback_data: 'm:sleeping' }, { text: '💰 Udhaar', callback_data: 'm:due' }], back])
}
async function due(chat, q) {
  const rows = await rpc('bot_due', { p_q: q })
  if (!rows.length) return send(chat, q ? `"${q}" naam ki koi dukan nahi mili. Naam ka thoda hissa likho, jaise "sharma".` : '✅ Kisi dukan ka udhaar baki nahi.', [back])
  const total = rows.reduce((a, r) => a + Number(r.balance), 0)
  const text = [q ? `💰 "${q}":` : '💰 Sabse zyada udhaar:', ...rows.map((r) =>
    `• ${r.name}${r.locality ? ' · ' + r.locality : ''}: ${rs(r.balance)}${Number(r.overdue) > 0 ? ` (overdue ${rs(r.overdue)})` : ''} · aakhri payment ${ago(r.last_payment)}${r.phone ? ' · ' + r.phone : ''}`),
    ...(rows.length > 1 ? ['', `Kul: ${rs(total)}`] : []), '', 'Dukan dabao: poora khata + WhatsApp reminder.'].join('\n')
  const buttons = rows.slice(0, 8).map((r) => [{ text: `${r.name.slice(0, 28)} · ${rs(r.balance)}`, callback_data: `d:${r.id}` }])
  await send(chat, text, [...buttons, back])
}
async function shopCard(chat, id) {
  const c = await rpc('bot_shop_card', { p_shop: id })
  if (!c) return send(chat, 'Ye dukan ab nahi mili.', [back])
  const label = { invoice: 'Bill', payment: 'Payment', adjustment: 'Adjust', reversal: 'Reverse', opening: 'Opening' }
  const L = [`🏪 ${c.name}${c.locality ? ' · ' + c.locality : ''}`, `${c.owner ? '👤 ' + c.owner + ' · ' : ''}${c.phone ? '📞 ' + c.phone : 'phone nahi'}${c.route ? '\n🚚 ' + c.route : ''}`, '',
    `💰 Baki: ${rs(c.balance)}${Number(c.overdue) > 0 ? ` · overdue ${rs(c.overdue)}` : ''} (credit ${c.credit_days ?? '?'} din)`,
    `🛒 Pichhle 30 din: ${c.orders_30d} order/bill · aakhri order ${ago(c.last_order)} · aakhri counter sale ${ago(c.last_sale)}`]
  if (c.entries?.length) {
    L.push('', 'Aakhri entries:')
    for (const e of c.entries) L.push(`• ${new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} ${label[e.type] ?? e.type}${e.mode ? ' (' + e.mode + ')' : ''}: ${rs(Math.abs(e.amount_paise))}`)
  }
  const buttons = []
  const amt = Number(c.overdue) > 0 ? c.overdue : c.balance
  const wa = Number(amt) > 0 ? waLink(c.phone, remindText(c.name, rs(amt))) : waLink(c.phone, `Namaste ${c.name}, K.D. Foods se.`)
  // (the phone number in the text is tappable to call; Telegram buttons can't open tel: links)
  if (wa) buttons.push([{ text: Number(amt) > 0 ? `📲 WhatsApp reminder (${rs(amt)})` : '📲 WhatsApp karo', url: wa }])
  await send(chat, L.join('\n'), [...buttons, [{ text: '💰 Sabka udhaar', callback_data: 'm:due' }], back])
}
async function stock(chat, q) {
  const rows = await rpc('bot_stock', { p_q: q })
  if (!rows.length) return send(chat, q ? `"${q}" naam ka koi item nahi mila.` : '✅ Sab items ka stock theek hai.', [back])
  await send(chat, [q ? `📦 "${q}":` : '📦 Kam stock:', ...rows.map((r) => `• ${item(r.item)}: ${r.on_hand} peti${r.low_threshold > 0 && r.on_hand <= r.low_threshold ? ' ⚠️' : ''}`)].join('\n'),
    [[{ text: '📝 Pepsi order banao', callback_data: 'm:order' }], back])
}
async function order(chat) {
  await typing(chat)
  const rows = await rpc('bot_reorder', {})
  const idle = idleLowText(await rpc('bot_idle_low', {}).catch(() => []))
  if (!rows.length) return send(chat, `✅ Abhi kuch mangane ki zaroorat nahi (7 din ka stock hai).${idle ? '\n\n' + idle : ''}`, [back])
  await send(chat, `📝 7 din ke stock ke liye (pichhli 30 din ki bikri se). Ye message Pepsi ko forward kar do:\n\n${reorderText(rows, hiDate(todayIST()))}`, [back])
  if (idle) await send(chat, idle, [back])
}
async function sleeping(chat) {
  const rows = await rpc('bot_sleeping', { p_days: 10 })
  if (!rows.length) return send(chat, '✅ Koi dukan 10 din se zyada chup nahi hai.', [back])
  await send(chat, ['😴 10+ din se order nahi:', ...rows.map((r) => `• ${r.name}${r.locality ? ' · ' + r.locality : ''}: ${r.days} din${r.phone ? ' · ' + r.phone : ''}`)].join('\n'),
    [...rows.slice(0, 6).map((r) => r.phone && waLink(r.phone, '') ? [{ text: `📲 ${r.name.slice(0, 30)}`, url: waLink(r.phone, `Namaste ${r.name}, K.D. Foods se. Kai din se order nahi aaya, koi dikkat hai? Is hafte ke offer ke liye batayein.`) }] : null).filter(Boolean), back])
}
const saleHelp = (chat) => send(chat, '🧾 Sale likhne ke 3 tarike:\n1. /sale likho, phir buttons se dukan → item → peti/rate → cash/UPI\n2. Ek line: /sale Sharma Kirana: sting 50 @495, nimbooz 30 @515, cash\n3. 🎤 Voice note: "Maruti Kirana sting 50 crate 495, UPI"', [back])

// Questions in plain words: live numbers + free Gemini. Falls back to the GitHub job if the AI is slow.
async function ask(chat, question, fallback) {
  await typing(chat)
  try {
    const [d, y, w] = await Promise.all([rpc('bot_day', { p_day: todayIST() }), rpc('bot_day', { p_day: todayIST(-1) }), rpc('bot_week', { p_end: todayIST() })])
    const prompt = `You are the helpful assistant of K.D. Foods, a Pepsi beverages dealer in Bhilai, India (drinks, water and milk drinks, no snacks: Pepsi, 7UP, Mirinda, Mountain Dew, Sting, Slice, Tropicana, Nimbooz, Aquafina, Gatorade, plus Creambell milk drinks), talking to the owners on Telegram.\n` +
      `Answer using ONLY this live data. Money is in paise (divide by 100, write as ₹ with Indian commas). "peti" = case. If the data can't answer, say so in one line and say which app page or bot command has it ` +
      `(/due, /stock, /order, /sleeping, /week, or the website pages Orders, Khata, Inventory, Counter sales).\n` +
      `TODAY ${JSON.stringify(d)}\nYESTERDAY ${JSON.stringify(y)}\nLAST 7 DAYS ${JSON.stringify(w.days)}\nDUES NOW ${JSON.stringify(w.today?.dues ?? {})}\n\n` +
      `Question: ${String(question).slice(0, 600)}\n\nReply in short, friendly Hinglish (Roman script), max 90 words, plain text with • bullets if useful. JSON: {"reply": "..."}`
    const a = await Promise.race([askJson(prompt), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 40000))])
    await send(chat, `🤖 ${String(a?.reply ?? '').slice(0, 3500) || 'Jawab nahi bana.'}`, [back])
  } catch (e) {
    console.log('ask failed', e.message)
    if (fallback) { await send(chat, '⏳ AI abhi busy hai, 1 minute me jawab aayega…'); await fallback() }
    else await send(chat, '⚠️ AI abhi busy hai, thodi der baad poochho.', [back])
  }
}

// Per-user scratch state (same bot_session row the /sale flow uses; the sale flow only claims flow === 'sale').
export const getState = (user) => rpc('bot_session_get', { p_user: user })
export const setState = (user, state) => rpc('bot_session_set', { p_user: user, p_state: state })

// ---------- entry points ----------
const SLASH = /^\/(menu|start|help|aaj|today|report|kal|yesterday|week|due|stock|sleeping|order|paisa|ask)(?:@\w+)?\s*([\s\S]*)$/i

/** Slash commands handled here. Returns true when handled. ctx.dispatch(inputs, workflow) starts a GitHub job. */
export async function handleOpsCommand(msg, text, ctx = {}) {
  const m = SLASH.exec(text)
  if (!m) return false
  const cmd = m[1].toLowerCase(), q = m[2].trim() || null, chat = msg.chat.id
  try {
    if (['menu', 'start'].includes(cmd)) await showMenu(chat)
    else if (cmd === 'help') await send(chat, HELP, MENU)
    else if (['aaj', 'today', 'report'].includes(cmd)) await today(chat, 0)
    else if (['kal', 'yesterday'].includes(cmd)) await today(chat, -1)
    else if (cmd === 'week') await week(chat)
    else if (cmd === 'due') await due(chat, q)
    else if (cmd === 'stock') await stock(chat, q)
    else if (cmd === 'sleeping') await sleeping(chat)
    else if (cmd === 'order') await order(chat)
    else if (cmd === 'paisa') await paisa(chat)
    else if (cmd === 'ask') {
      if (!q) await send(chat, 'Aise likho: /ask is hafte sabse zyada kya bika? (ya bina /ask ke seedha sawal likho)')
      else await ask(chat, q, ctx.dispatch && (() => ctx.dispatch({ mode: 'ask', question: q.slice(0, 800) }, 'ops.yml')))
    }
  } catch (e) {
    await send(chat, `⚠️ ${cmd} me error: ${String(e.message).slice(0, 200)}`)
  }
  return true
}

/**
 * A plain message (no slash). Returns 'done' (answered), 'scheme' (caller sends it to the scheme reader) or 'ignore'.
 * ctx: { dispatch, setState } so an unsure message can be parked until the owner taps a button.
 */
export async function handleText(msg, text, ctx = {}) {
  const chat = msg.chat.id
  const replyToBot = !!msg.reply_to_message?.from?.is_bot
  const forwarded = !!(msg.forward_origin || msg.forward_from || msg.forward_from_chat || msg.forward_sender_name)
  // A reply to the scheme card is a correction of that scheme: keep the old behaviour.
  if (replyToBot && /Approve|Pepsi message|poster/i.test(msg.reply_to_message.caption ?? msg.reply_to_message.text ?? '')) return 'scheme'
  const it = detectIntent(text, { forwarded, replyToBot })
  try {
    switch (it.kind) {
      case 'scheme': return 'scheme'
      case 'ignore': return 'ignore'
      case 'menu': await showMenu(chat); break
      case 'today': await today(chat, 0); break
      case 'yesterday': await today(chat, -1); break
      case 'week': await week(chat); break
      case 'due': await due(chat, it.q); break
      case 'stock': await stock(chat, it.q); break
      case 'sleeping': await sleeping(chat); break
      case 'reorder': await order(chat); break
      case 'money': await paisa(chat); break
      case 'sale_help': await saleHelp(chat); break
      case 'ask': await ask(chat, text, ctx.dispatch && (() => ctx.dispatch({ mode: 'ask', question: text.slice(0, 800) }, 'ops.yml'))); break
      case 'unsure':
        if (ctx.setState) await ctx.setState(msg.from.id, { flow: 'unsure', text: text.slice(0, 1900) })
        await send(chat, 'Ye kya hai?', [[{ text: '📢 Pepsi scheme hai', callback_data: 'u:scheme' }, { text: '❓ Sawal hai', callback_data: 'u:ask' }], [{ text: '🙈 Kuch nahi', callback_data: 'u:none' }]])
        break
    }
  } catch (e) {
    await send(chat, `⚠️ Error: ${String(e.message).slice(0, 200)}`)
  }
  return 'done'
}

/** Buttons. Returns true when handled. ctx: { dispatch, getState, setState, sendScheme(text, who) }. */
export async function handleOpsTap(q, ctx = {}) {
  const data = String(q.data ?? ''), chat = q.message?.chat?.id
  const answer = (text) => tg('answerCallbackQuery', { callback_query_id: q.id, ...(text ? { text } : {}) })
  let m
  if ((m = /^m:(\w+)$/.exec(data))) {
    await answer()
    try {
      const k = m[1]
      if (k === 'menu') await showMenu(chat)
      else if (k === 'today') await today(chat, 0)
      else if (k === 'yday') await today(chat, -1)
      else if (k === 'week') await week(chat)
      else if (k === 'due') await due(chat, null)
      else if (k === 'stock') await stock(chat, null)
      else if (k === 'order') await order(chat)
      else if (k === 'sleeping') await sleeping(chat)
      else if (k === 'paisa') await paisa(chat)
      else if (k === 'sale') await saleHelp(chat)
      else if (k === 'help') await send(chat, HELP, [back])
    } catch (e) { await send(chat, `⚠️ ${String(e.message).slice(0, 200)}`) }
    return true
  }
  if ((m = /^d:([0-9a-f-]{36})$/i.exec(data))) {
    await answer()
    try { await shopCard(chat, m[1]) } catch (e) { await send(chat, `⚠️ ${String(e.message).slice(0, 200)}`) }
    return true
  }
  if ((m = /^u:(scheme|ask|none)$/.exec(data))) {
    const st = ctx.getState ? await ctx.getState(q.from.id) : {}
    const text = st?.flow === 'unsure' ? st.text : null
    if (ctx.setState) await ctx.setState(q.from.id, {})
    tg('editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } })
    if (!text || m[1] === 'none') { await answer(text ? 'Theek hai' : 'Ye message purana ho gaya'); return true }
    await answer()
    if (m[1] === 'scheme' && ctx.sendScheme) await ctx.sendScheme(text, q.from.first_name ?? '')
    else await ask(chat, text, ctx.dispatch && (() => ctx.dispatch({ mode: 'ask', question: text.slice(0, 800) }, 'ops.yml')))
    return true
  }
  // ✅ = post at 19:30, ⚡ = post right now (starts the social job for this post only).
  if ((m = /^sp:(ok|now):([0-9a-f-]{36})$/i.exec(data))) {
    try {
      const r = await rpc('bot_social_approve', { p_id: m[2] })
      if (r !== 'queued') { await answer(r === 'posted' ? 'Ye pehle hi post ho chuka' : r === 'skipped' ? 'Ye post cancel ho chuka' : 'Ye pehle se queue me hai'); if (r !== 'draft') await tg('editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {}); return true }
      const now = m[1] === 'now'
      await answer(now ? 'Abhi post kar raha hun…' : 'Theek hai, aaj 7:30 baje')
      // ⚡ = nothing left to choose, so all buttons go; ✅ keeps ❌ so it can still be stopped before 7:30 PM
      await tg('editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: now ? [] : [[{ text: '❌ Mat daalo (7:30 se pehle)', callback_data: `sp:no:${m[2]}` }]] } })
      if (now && ctx.dispatch) await ctx.dispatch({ mode: 'social', post: m[2] }, 'ops.yml')
      await send(chat, now ? `⚡ ${q.from?.first_name ?? ''}: post ho raha hai, 2-3 minute me link aayega.` : `✅ ${q.from?.first_name ?? ''}: aaj 7:30 baje Facebook + Instagram pe jayega.`)
    } catch (e) { await answer(`Error: ${String(e.message).slice(0, 150)}`) }
    return true
  }
  // ❌ under a saved kharcha: remove it (stays in the audit log)
  if ((m = /^kx:([0-9a-f-]{36})$/i.exec(data))) {
    try {
      const r = await rpc('bot_void_expense', { p_id: m[1] })
      await answer(r === 'voided' ? 'Kharcha hata diya' : 'Ye pehle hi hat chuka')
      await tg('editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {})
      if (r === 'voided') await send(chat, `🗑 ${q.from?.first_name ?? ''}: ye kharcha hata diya.`)
    } catch (e) { await answer(`Error: ${String(e.message).slice(0, 150)}`) }
    return true
  }
  // 📘 = Facebook + Telegram channel now; Instagram by hand: the bot sends the same edit without music to download.
  if ((m = /^sp:fb:([0-9a-f-]{36})$/i.exec(data))) {
    try {
      const r = await rpc('bot_social_approve_fb', { p_id: m[1] })
      if (r !== 'queued') { await answer(r === 'posted' ? 'Ye pehle hi post ho chuka' : r === 'skipped' ? 'Ye post cancel ho chuka' : 'Ye pehle se queue me hai'); if (r !== 'draft') await tg('editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {}); return true }
      await answer('Facebook pe daal raha hun…')
      await tg('editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } })
      if (ctx.dispatch) await ctx.dispatch({ mode: 'social', post: m[1] }, 'ops.yml')
      await send(chat, `📘 ${q.from?.first_name ?? ''}: Facebook + Telegram pe abhi ja raha hai. Instagram ke liye bina-music video 2-3 minute me yahin aayega.`)
    } catch (e) { await answer(`Error: ${String(e.message).slice(0, 150)}`) }
    return true
  }
  if ((m = /^sp:no:([0-9a-f-]{36})$/i.exec(data))) {
    try {
      const r = await rpc('bot_social_skip', { p_id: m[1] })
      await answer(r === 'skipped' ? 'Theek hai, post nahi hoga' : r === 'posted' ? 'Ye pehle hi post ho chuka' : 'Ye post ab queue me nahi')
      if (r !== 'skipped') await tg('editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {})
      if (r === 'skipped') {
        await tg('editMessageReplyMarkup', { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } })
        await send(chat, `❌ ${q.from?.first_name ?? ''}: ye post nahi jayega.`)
      }
    } catch (e) { await answer(`Error: ${String(e.message).slice(0, 150)}`) }
    return true
  }
  return false
}

/** "kharcha petrol 800" (or /kharcha ...) -> saved as today's kharcha, with an undo button. Returns true when handled. */
export async function handleKharcha(msg, text) {
  const m = /^\/?(kharcha|kharch|khrcha|expense|kharcha:)\s+(.+)$/i.exec(String(text ?? '').trim())
  if (!m) return false
  const k = parseKharcha(m[2])
  if (!k) { await send(msg.chat.id, 'Rakam samajh nahi aayi. Aise likho: kharcha petrol 800  (ya: kharcha gaadi kiraya 1500)'); return true }
  try {
    const id = await rpc('bot_add_expense', { p_amount_paise: k.amount_paise, p_category: k.category, p_note: k.note, p_who: msg.from?.first_name ?? '' })
    await tg('sendMessage', { chat_id: msg.chat.id, reply_to_message_id: msg.message_id,
      text: `💸 Kharcha save: ₹${(k.amount_paise / 100).toLocaleString('en-IN')} · ${k.category}${k.note ? ` · ${k.note}` : ''}\nWebsite → Kharcha me dikhega, aur aaj ke profit me jud gaya.`,
      reply_markup: { inline_keyboard: [[{ text: '❌ Galat hai, hatao', callback_data: `kx:${id}` }]] } })
  } catch (e) { await send(msg.chat.id, `⚠️ Kharcha save nahi hua: ${String(e.message).slice(0, 150)}`) }
  return true
}

/** Reply to a post preview with new text = new caption for that post (before it is posted). Returns true when handled. */
export async function handleSocialReply(msg, text) {
  const reply = msg.reply_to_message
  if (!reply?.from?.is_bot) return false
  const id = postIdOf(reply)
  if (!id) return false
  try {
    const r = await rpc('bot_social_caption', { p_id: id, p_caption: finishCaption(text) })
    await send(msg.chat.id, r === 'locked' ? 'Ye post ho chuka ya cancel hai, caption ab nahi badlega.' : `✏️ Caption badal diya:\n\n${finishCaption(text)}`)
  } catch (e) { await send(msg.chat.id, `⚠️ ${String(e.message).slice(0, 200)}`) }
  return true
}
