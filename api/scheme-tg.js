// Telegram webhook for the K.D. Foods scheme bot (Vercel serverless function).
// Telegram -> here -> starts the GitHub workflow "scheme.yml" (AI + poster run there, free).
// Only the KD Schemes group and the allowed Telegram users get any reaction; everything else is ignored.
//
// Vercel env vars: KD_BOT_TOKEN, KD_CHAT_ID, KD_ALLOWED (comma-separated Telegram user ids),
//                  TG_SECRET (random string, also given to Telegram as the webhook secret),
//                  GH_DISPATCH_TOKEN (fine-grained token: this repo only, Actions read+write), GH_REPO (owner/name)

import { handleSaleMessage, handleSaleTap } from './_sale.js'

// Values are trimmed so a stray newline in a Vercel variable can never break a token or a comparison.
const env = new Proxy({}, { get: (_, k) => String(process.env[k] ?? '').trim() })

const tg = (method, payload) =>
  fetch(`https://api.telegram.org/bot${env.KD_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }).catch(() => null)

async function dispatch(inputs) {
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/scheme.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs }),
  })
  if (!r.ok) await tg('sendMessage', { chat_id: env.KD_CHAT_ID, text: `⚠️ GitHub start nahi hua (${r.status}). Token ya workflow check karo.` })
}

const allowed = (from, chatId) =>
  String(chatId) === String(env.KD_CHAT_ID) && !!from &&
  String(env.KD_ALLOWED ?? '').split(',').map((s) => s.trim()).includes(String(from.id))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!env.TG_SECRET || req.headers['x-telegram-bot-api-secret-token'] !== env.TG_SECRET) return res.status(401).end()
  try {
    const u = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}

    if (u.callback_query) {
      const q = u.callback_query
      if (!allowed(q.from, q.message?.chat?.id)) { await tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Sirf owners' }); return res.status(200).end() }
      if (String(q.data ?? '').startsWith('s:')) { await handleSaleTap(q); return res.status(200).end() }
      const m = /^(ok|no):([0-9a-f-]{36})$/i.exec(q.data ?? '')
      if (!m) return res.status(200).end()
      await tg('answerCallbackQuery', { callback_query_id: q.id, text: m[1] === 'ok' ? 'App me save kar raha hun…' : 'Theek hai' })
      await tg('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } })
      await dispatch({ mode: 'approve', action: m[1], draft: m[2], who: q.from.first_name ?? '' })
      return res.status(200).end()
    }

    const msg = u.message
    if (!msg || !allowed(msg.from, msg.chat?.id)) return res.status(200).end()
    const text = (msg.text ?? msg.caption ?? '').trim()
    if (!text) return res.status(200).end()
    // Counter sales: "/sale" and anything typed while a sale is open.
    if (await handleSaleMessage(msg)) return res.status(200).end()
    if (text.startsWith('/')) {
      if (/^\/(start|help)/i.test(text)) await tg('sendMessage', { chat_id: msg.chat.id, text: 'Main 2 kaam karta hun:\n\n🧾 Sale likhna: /sale likho aur buttons se karo, ya ek line me: /sale Sharma Kirana: sting 50 @495, nimbooz 30 @515, cash\n\n📢 Pepsi scheme: Pepsi wale ka message yahan paste karo. Matlab, poster aur ✅ Approve milega.' })
      return res.status(200).end()
    }
    // A reply to the bot's own message is a correction: send the original and the correction together.
    const reply = msg.reply_to_message
    const orig = reply?.from?.is_bot ? (reply.caption ?? reply.text ?? '') : ''
    const task = orig ? `Pehle bot ne ye samjha tha:\n${orig.slice(0, 900)}\n\nSahi baat (isko maano):\n${text}` : text
    await tg('sendMessage', { chat_id: msg.chat.id, text: '⏳ Samajh raha hun, 1 minute…' })
    await dispatch({ mode: 'explain', task: task.slice(0, 1900), who: msg.from.first_name ?? '' })
    return res.status(200).end()
  } catch (e) {
    console.error('scheme-tg', e)
    return res.status(200).end()  // never make Telegram retry the same update
  }
}
