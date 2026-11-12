// Telegram webhook for the K.D. Foods scheme bot (Vercel serverless function).
// Telegram -> here -> starts the GitHub workflow "scheme.yml" (AI + poster run there, free).
// Only the KD Schemes group and the allowed Telegram users get any reaction; everything else is ignored.
//
// Vercel env vars: KD_BOT_TOKEN, KD_CHAT_ID, KD_ALLOWED (comma-separated Telegram user ids),
//                  TG_SECRET (random string, also given to Telegram as the webhook secret),
//                  GH_DISPATCH_TOKEN (fine-grained token: this repo only, Actions read+write), GH_REPO (owner/name)

import { handleSaleMessage, handleSaleTap, handleSaleVoice } from './_sale.js'
import { getState, handleKharcha, handleOpsCommand, handleOpsTap, handleSocialReply, handleText, setState } from './_ops.js'
import { mediaOf, tooBig } from '../scripts/ops/media.mjs'

// Values are trimmed so a stray newline in a Vercel variable can never break a token or a comparison.
const env = new Proxy({}, { get: (_, k) => String(process.env[k] ?? '').trim() })

const tg = (method, payload) =>
  fetch(`https://api.telegram.org/bot${env.KD_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }).catch(() => null)

async function dispatch(inputs, workflow = 'scheme.yml') {
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs }),
  })
  if (!r.ok) await tg('sendMessage', { chat_id: env.KD_CHAT_ID, text: `⚠️ GitHub start nahi hua (${r.status}). Token ya workflow check karo.` })
}

// Send a pasted Pepsi message (or a correction of one) to the scheme reader (GitHub, ~1 min).
async function sendScheme(chat, text, who) {
  await tg('sendMessage', { chat_id: chat, text: '⏳ Pepsi message samajh raha hun, 1 minute…' })
  await dispatch({ mode: 'explain', task: text.slice(0, 1900), who })
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
      const ctx = { dispatch, getState, setState, sendScheme: (text, who) => sendScheme(q.message.chat.id, text, who) }
      if (await handleOpsTap(q, ctx)) return res.status(200).end()
      const m = /^(ok|no):([0-9a-f-]{36})$/i.exec(q.data ?? '')
      if (!m) return res.status(200).end()
      await tg('answerCallbackQuery', { callback_query_id: q.id, text: m[1] === 'ok' ? 'App me save kar raha hun…' : 'Theek hai' })
      await tg('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } })
      await dispatch({ mode: 'approve', action: m[1], draft: m[2], who: q.from.first_name ?? '' })
      return res.status(200).end()
    }

    const msg = u.message
    if (!msg || !allowed(msg.from, msg.chat?.id)) return res.status(200).end()
    // Video / photo for the MarginMart page: saved to the media library, then auto-edited into a Reel (reel.yml); preview comes back with ✅ ⚡ 📘 ❌.
    const media = mediaOf(msg)
    if (media) {
      if (tooBig(media)) {
        await tg('sendMessage', { chat_id: msg.chat.id, reply_to_message_id: msg.message_id, text: '🎬 Video 20 MB se bada hai, bot ise utaar nahi sakta. Telegram me isko normal video ki tarah bhejo (file nahi), ya 1 minute se chhota clip bhejo.' })
        return res.status(200).end()
      }
      await tg('sendMessage', { chat_id: msg.chat.id, reply_to_message_id: msg.message_id, text: `📥 ${media.type === 'video' ? 'Video' : 'Photo'} library me save. Aur photo/video bhejne hain to abhi bhej do, sab milake ek Reel banega. Edit hoke ~5 minute me preview aayega.` })
      await dispatch({ mode: 'media', file: media.file_id, mtype: media.type, note: media.note.slice(0, 500), who: msg.from.first_name ?? '' }, 'ops.yml')
      return res.status(200).end()
    }
    // Voice note: "maruti kirana sting 50 crate 495" -> heard, parsed, same confirm screen as a typed /sale.
    if (await handleSaleVoice(msg)) return res.status(200).end()
    const text = (msg.text ?? msg.caption ?? '').trim()
    if (!text) return res.status(200).end()
    // A reply to a post preview = the new caption for that post.
    if (await handleSocialReply(msg, text)) return res.status(200).end()
    // "kharcha petrol 800": today's kharcha (Kharcha page + day profit)
    if (await handleKharcha(msg, text)) return res.status(200).end()
    // Counter sales: "/sale" and anything typed while a sale is open.
    if (await handleSaleMessage(msg)) return res.status(200).end()
    const ctx = { dispatch, getState, setState }
    // Menu, instant answers and /ask (no GitHub run): /menu /aaj /kal /week /due /stock /order /sleeping /ask.
    if (await handleOpsCommand(msg, text, ctx)) return res.status(200).end()
    // /check = full system check (needs GitHub, so it runs the watchdog job).
    if (/^\/check(?:@\w+)?\b/i.test(text)) {
      await tg('sendMessage', { chat_id: msg.chat.id, text: '⏳ System check chala raha hun, 1 minute…' })
      await dispatch({ mode: 'watchdog', force: '1' }, 'ops.yml')
      return res.status(200).end()
    }
    if (text.startsWith('/')) {
      await tg('sendMessage', { chat_id: msg.chat.id, text: 'Ye command nahi pehchana. /menu dabao, ya seedha likho jaise "aaj ka hisaab".' })
      return res.status(200).end()
    }
    // Plain words: answer if it is for the bot, ignore owners' chit-chat, and send only real Pepsi messages to the scheme reader.
    if ((await handleText(msg, text, ctx)) !== 'scheme') return res.status(200).end()
    // A reply to the bot's scheme card is a correction: send the original and the correction together.
    const reply = msg.reply_to_message
    const orig = reply?.from?.is_bot ? (reply.caption ?? reply.text ?? '') : ''
    const task = orig ? `Pehle bot ne ye samjha tha:\n${orig.slice(0, 900)}\n\nSahi baat (isko maano):\n${text}` : text
    await sendScheme(msg.chat.id, task, msg.from.first_name ?? '')
    return res.status(200).end()
  } catch (e) {
    console.error('scheme-tg', e)
    return res.status(200).end()  // never make Telegram retry the same update
  }
}
