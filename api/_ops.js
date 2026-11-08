// Quick read-only Telegram commands for the owners (imported by api/scheme-tg.js; "_" files are not routes).
//   /due [shop]     who owes money (or one shop's balance)       /stock [item]   what is low (or one item's stock)
//   /sleeping       shops that stopped ordering
// Every DB call goes through key-checked RPCs (KD_BOT_KEY), same as the /sale flow, so no service key lives in Vercel.
const env = new Proxy({}, { get: (_, k) => String(process.env[k] ?? '').trim() })
const rs = (p) => '₹' + (Number(p) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })
// The catalogue sometimes stores pack and flavour as the same words; show them once.
const item = (s) => { const w = String(s ?? '').trim().split(/\s+/); const h = w.length / 2
  return Number.isInteger(h) && h > 0 && w.slice(0, h).join(' ') === w.slice(h).join(' ') ? w.slice(0, h).join(' ') : String(s ?? '').trim() }
async function rpc(fn, args) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: env.KD_BOT_KEY, ...args }) })
  const t = await r.text()
  if (!r.ok) { let m = t; try { m = JSON.parse(t).message } catch { /* keep text */ } throw new Error(m || `rpc ${fn} ${r.status}`) }
  return t ? JSON.parse(t) : null
}
const send = (chat, text) => fetch(`https://api.telegram.org/bot${env.KD_BOT_TOKEN}/sendMessage`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }) }).catch(() => null)
const ago = (iso) => { if (!iso) return 'kabhi nahi'; const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5); return d <= 0 ? 'aaj' : `${d} din pehle` }

export async function handleOpsCommand(msg, text) {
  const m = /^\/(due|stock|sleeping)(?:@\w+)?\s*([\s\S]*)$/i.exec(text)
  if (!m) return false
  const cmd = m[1].toLowerCase(), q = m[2].trim() || null, chat = msg.chat.id
  try {
    if (cmd === 'due') {
      const rows = await rpc('bot_due', { p_q: q })
      if (!rows.length) return await send(chat, q ? `"${q}" naam ki koi dukan nahi mili.` : '✅ Kisi dukan ka udhaar baki nahi.'), true
      const total = rows.reduce((a, r) => a + Number(r.balance), 0)
      await send(chat, [q ? `💰 "${q}":` : '💰 Sabse zyada udhaar:', ...rows.map((r) =>
        `• ${r.name}${r.locality ? ' · ' + r.locality : ''}: ${rs(r.balance)}${Number(r.overdue) > 0 ? ` (overdue ${rs(r.overdue)})` : ''} · aakhri payment ${ago(r.last_payment)}${r.phone ? ' · ' + r.phone : ''}`),
        ...(rows.length > 1 ? ['', `Kul: ${rs(total)}`] : [])].join('\n'))
    } else if (cmd === 'stock') {
      const rows = await rpc('bot_stock', { p_q: q })
      if (!rows.length) return await send(chat, q ? `"${q}" naam ka koi item nahi mila.` : '✅ Sab items ka stock theek hai.'), true
      await send(chat, [q ? `📦 "${q}":` : '📦 Kam stock:', ...rows.map((r) => `• ${item(r.item)}: ${r.on_hand} peti${r.low_threshold > 0 && r.on_hand <= r.low_threshold ? ' ⚠️' : ''}`)].join('\n'))
    } else {
      const rows = await rpc('bot_sleeping', { p_days: 10 })
      if (!rows.length) return await send(chat, '✅ Koi dukan 10 din se zyada chup nahi hai.'), true
      await send(chat, ['😴 10+ din se order nahi:', ...rows.map((r) => `• ${r.name}${r.locality ? ' · ' + r.locality : ''}: ${r.days} din${r.phone ? ' · ' + r.phone : ''}`)].join('\n'))
    }
  } catch (e) {
    await send(chat, `⚠️ ${cmd} me error: ${String(e.message).slice(0, 200)}`)
  }
  return true
}

// ❌ "Mat daalo" under a queued social post preview: callback_data "sp:no:<social_post id>".
export async function handleOpsTap(q) {
  const m = /^sp:no:([0-9a-f-]{36})$/i.exec(q.data ?? '')
  if (!m) return false
  const answer = (text) => fetch(`https://api.telegram.org/bot${env.KD_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: q.id, text }) }).catch(() => null)
  try {
    const r = await rpc('bot_social_skip', { p_id: m[1] })
    await answer(r === 'skipped' ? 'Theek hai, post nahi hoga' : r === 'posted' ? 'Ye pehle hi post ho chuka' : 'Ye post ab queue me nahi')
    if (r === 'skipped') {
      await fetch(`https://api.telegram.org/bot${env.KD_BOT_TOKEN}/editMessageReplyMarkup`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }) }).catch(() => null)
      await send(q.message.chat.id, `❌ ${q.from?.first_name ?? ''}: ye post nahi jayega.`)
    }
  } catch (e) { await answer(`Error: ${String(e.message).slice(0, 150)}`) }
  return true
}
