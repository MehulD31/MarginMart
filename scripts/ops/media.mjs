// Owner videos/photos for the MarginMart Facebook page + Instagram (@marginmartofficial).
// Mehul or Shobhit send a clip to the KD bot -> AI writes a Hinglish caption -> preview in the group with
// ✅ (post at 19:30) / ⚡ (post now) / ❌, and "reply with new text" to change the caption. Pure helpers here (unit-tested).

export const PHONE = '9630012636'
export const TAGS = '#MarginMart #KDFoods #Bhilai #BhilaiBusiness #Wholesale #Dukandar #Kirana'
const BOT_MAX = 20 * 1024 * 1024        // Telegram bots can only download files up to 20 MB

/** The video or photo in a Telegram message, or null. Photos only count when they are meant for the page:
 *  no caption, or a caption that says post/insta/facebook (other photos, e.g. a forwarded Pepsi scheme, keep their old path). */
export function mediaOf(msg) {
  if (!msg) return null
  const note = String(msg.caption ?? '').trim()
  const doc = msg.document, mime = String(doc?.mime_type ?? '')
  const v = msg.video ?? msg.animation ?? (mime.startsWith('video/') ? doc : null)
  if (v) return { type: 'video', file_id: v.file_id, size: Number(v.file_size ?? 0), note }
  const photo = msg.photo?.length ? msg.photo[msg.photo.length - 1] : mime.startsWith('image/') ? doc : null
  if (photo && (!note || /\b(post|insta|instagram|facebook|fb|page|reel|daalo|dalo)\b/i.test(note)))
    return { type: 'image', file_id: photo.file_id, size: Number(photo.file_size ?? 0), note }
  return null
}
export const tooBig = (m) => m.size > BOT_MAX

/** Prompt for the AI caption. Facts from .kiro/steering/business-facts.md: MarginMart by K.D. Foods, wholesale, not "cold drinks only". */
export function captionPrompt(note, type) {
  return [
    'Write an Instagram/Facebook caption for MarginMart (by K.D. Foods), a wholesale distributor in Bhilai, Chhattisgarh, India.',
    'It sells drinks (Pepsi, 7UP, Mirinda, Mountain Dew, Sting, Slice, Tropicana, Nimbooz, Gatorade), Aquafina water, Creambell milk drinks and more. Never call it a PepsiCo distributor; never mention snacks.',
    'Readers: kirana and shop owners ("dukandar bhai"), hotels, canteens, wedding and function buyers.',
    `This is a ${type === 'video' ? 'short video (Reel)' : 'photo'}. What the owner said about it: "${String(note || 'godown / stock / delivery clip').slice(0, 400)}".`,
    'Rules: simple Hinglish (Hindi in English letters), 3-5 short lines, first line is a hook (e.g. "Dukandar bhai, maal aa gaya! 🚚").',
    'Use only facts the owner gave; no prices or offers unless the owner gave them. Name 2-3 Bhilai areas: Supela, Bhilai 3, Power House, Smriti Nagar. Never mention Durg.',
    `End with: "📞 Call/WhatsApp ${PHONE}" on its own line. Do not add hashtags. Max 450 characters. JSON: {"caption": "..."}`,
  ].join('\n')
}

/** Caption that always works (AI down): the owner's words + phone + tags. */
export function fallbackCaption(note, type) {
  const hook = type === 'video' ? 'Dukandar bhai, dekho aaj ka maal! 🚚' : 'Dukandar bhai, MarginMart se taaza maal 🚚'
  return finishCaption(`${hook}\n${note ? note.slice(0, 300) + '\n' : ''}Bhilai me wholesale rate pe daily delivery.\n📞 Call/WhatsApp ${PHONE}`)
}

/** Final caption: phone always present, our hashtags added once, no markdown, within Instagram's limit. */
export function finishCaption(text) {
  let c = String(text ?? '').replace(/\*\*/g, '').replace(/#\w+/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!c.replace(/\D/g, '').includes(PHONE)) c += `\n📞 Call/WhatsApp ${PHONE}`      // '96300 12636' counts too
  return `${c.slice(0, 1800)}\n\n${TAGS}`
}

/** Post id from the buttons of a preview message (used when someone replies to the preview with a new caption). */
export function postIdOf(message) {
  for (const row of message?.reply_markup?.inline_keyboard ?? []) for (const b of row) {
    const m = /^sp:(?:ok|now|no):([0-9a-f-]{36})$/i.exec(b.callback_data ?? '')
    if (m) return m[1]
  }
  return null
}

/** Buttons under a preview. */
export const previewButtons = (id) => ({ inline_keyboard: [
  [{ text: '✅ Aaj 7:30 baje post', callback_data: `sp:ok:${id}` }, { text: '⚡ Abhi post', callback_data: `sp:now:${id}` }],
  [{ text: '❌ Mat daalo', callback_data: `sp:no:${id}` }]] })

// WhatsApp forward link for a published post: caption + the post link, ready to paste into the community.
export const waShare = (caption, link) => `https://wa.me/?text=${encodeURIComponent([String(caption ?? '').slice(0, 600), link].filter(Boolean).join('\n\n'))}`

// ---------- Comment "RATE" -> rate list in DM (Facebook + Instagram), owner 12 Nov 2026 ----------
/** Does this comment ask for rates? (Reels end with "comment karein RATE".) */
export const wantsRate = (text) => /\b(rate|rates|ret|reat|price|prices|bhav|bhaav|daam|dam|rate\s*list|ratelist|kitne\s*ka|kitna)\b|रेट|भाव|दाम/i.test(String(text ?? ''))
export const GROUP = 'https://chat.whatsapp.com/DrCMzkTTp4Q8ozaXZ4KIXm'
/** The private reply (one per comment, Meta's rule). No prices in it: the rates go on WhatsApp, where they stay current. */
export const rateDm = (name) => [
  `Namaste${name ? ' ' + String(name).split(' ')[0] : ''} ji 🙏 MarginMart (by K.D. Foods), Bhilai se.`,
  '',
  'Aaj ki wholesale rate list ke liye:',
  `1️⃣ WhatsApp group join karein (roz ke rate + offers): ${GROUP}`,
  `2️⃣ Ya apni dukaan ka naam aur area WhatsApp karein: wa.me/91${PHONE} , poori rate list bhej denge.`,
  '',
  'Drinks, water, milk drinks & more · daily delivery 🚚',
].join('\n')
export const RATE_PUBLIC = 'Rate list aapke DM mein bhej di hai 📩 Inbox check karein 🙏'

// ---------- Messenger / Instagram DM auto-reply (owner, 12 Nov 2026) ----------
/** First reply to a new DM: the rate-list message for rate questions, otherwise a short greeting that asks for shop + area. */
export function dmReply(name, text) {
  if (wantsRate(text)) return rateDm(name)
  const first = name ? ' ' + String(name).split(' ')[0] : ''
  return [
    `Namaste${first} ji 🙏 MarginMart (by K.D. Foods), Bhilai.`,
    'Hum dukaanon tak daily delivery karte hain: drinks, water, milk drinks & more, wholesale rate pe.',
    '',
    'Jaldi help ke liye bataiye: 1) Dukaan ka naam 2) Area 3) Kya maal chahiye.',
    `Rate list ke liye "RATE" likhiye, ya WhatsApp group join karein: ${GROUP}`,
    `📞 ${PHONE}`,
  ].join('\n')
}
/** Should we auto-reply now? Only when the customer wrote last and the Page hasn't answered in the last 24 h. */
export function needsAutoReply(messages, pageIds, now = Date.now()) {
  const list = [...(messages ?? [])].sort((a, b) => Date.parse(b.created_time) - Date.parse(a.created_time))
  if (!list.length || pageIds.includes(list[0].from?.id)) return false
  const lastPage = list.find((m) => pageIds.includes(m.from?.id))
  return !lastPage || now - Date.parse(lastPage.created_time) > 24 * 3600e3
}
