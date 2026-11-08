// Telegram counter-sale flow for the K.D. Foods bot (imported by api/scheme-tg.js; "_" files are not routes).
// Two ways in: "/sale" -> buttons (shop -> item -> cases + price -> cash/UPI -> confirm),
//              "/sale Sharma Kirana: sting 50 @495, nimbooz 30 @515, cash" -> AI reads it -> same confirm screen.
// Every DB call goes through key-checked RPCs (KD_BOT_KEY), so no service key lives in Vercel.
import { randomUUID } from 'node:crypto'
import { billPdf, billToken } from './_billpdf.js'

const env = new Proxy({}, { get: (_, k) => String(process.env[k] ?? '').trim() })
const rs = (p) => '₹' + (Number(p) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })

async function rpc(fn, args) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: env.KD_BOT_KEY, ...args }),
  })
  const t = await r.text()
  if (!r.ok) { let m = t; try { m = JSON.parse(t).message } catch { /* keep text */ } throw new Error(m || `rpc ${fn} ${r.status}`) }
  return t ? JSON.parse(t) : null
}
const tg = (method, payload) => fetch(`https://api.telegram.org/bot${env.KD_BOT_TOKEN}/${method}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((r) => r.json()).catch(() => null)
/** Builds the bill PDF and posts it to the chat as a document. */
async function sendBillPdf(chat, id) {
  const bill = await rpc('bot_bill', { p_id: id })
  const fd = new FormData()
  fd.append('chat_id', String(chat))
  fd.append('document', new Blob([await billPdf(bill)], { type: 'application/pdf' }), `${bill.number}.pdf`)
  fd.append('caption', `🧾 ${bill.number} · ${bill.buyer?.name ?? ''} · ${rs(bill.total_paise)}`)
  const j = await fetch(`https://api.telegram.org/bot${env.KD_BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd }).then((x) => x.json())
  if (!j.ok) throw new Error(JSON.stringify(j).slice(0, 160))
}
const send = (chat, text, buttons) => tg('sendMessage', { chat_id: chat, text, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) })
const getState = (user) => rpc('bot_session_get', { p_user: user })
const setState = (user, state) => rpc('bot_session_set', { p_user: user, p_state: state })
const pairs = (btns) => btns.reduce((rows, b, i) => (i % 2 ? rows[rows.length - 1].push(b) : rows.push([b]), rows), [])
const cancelBtn = { text: '❌ Cancel', callback_data: 's:cancel' }

async function showShops(chat, q) {
  const shops = await rpc('bot_shops', { p_q: q || null })
  // Many shops share a name ("Dewangan Kirana" x7), so the button also shows the area.
  const rows = pairs(shops.map((s) => ({ text: `${s.name.slice(0, 26)}${s.locality ? ' · ' + s.locality.slice(0, 16) : ''}`, callback_data: `s:shop:${s.id}` })))
  if (q) rows.push([{ text: `➕ Nayi dukan: ${q.slice(0, 25)}`, callback_data: 's:add' }])
  rows.push([cancelBtn])
  const head = q ? (shops.length ? `"${q}" se ye dukane mili. Chuno, ya nayi jodo:` : `"${q}" naam ki koi dukan nahi. Nayi jodni hai?`)
    : (shops.length ? 'Kis dukan ka sale? Naam, area ya phone likh kar dhoondho, ya neeche chuno:' : 'Abhi koi dukan nahi hai. Dukan ka naam likho, main jod dunga.')
  await send(chat, head, rows)
}

async function showItems(chat, state) {
  const cat = await rpc('bot_catalog', {})
  const inStock = cat.filter((c) => c.on_hand > 0)
  const list = (inStock.length ? inStock : cat).slice(0, 30)
  const rows = pairs(list.map((c) => ({ text: `${c.label.replace(/ All Flavours| PET/gi, '').slice(0, 24)} (${c.on_hand})`, callback_data: `s:item:${c.variant_id}` })))
  rows.push([cancelBtn])
  await send(chat, `🏪 ${state.shop.name}\nKaunsa item? (bracket me stock)`, rows)
}

function cartText(state) {
  const lines = state.lines.map((l, i) => `${i + 1}. ${l.label}: ${l.qty} × ${rs(l.price)} = ${rs(l.qty * l.price)}${l.price < l.floor ? `  ⚠️ loss (floor ${rs(l.floor)})` : ''}${l.stock != null && l.qty > l.stock ? `  ⚠️ stock me sirf ${Math.max(0, l.stock)} peti` : ''}`)
  const total = state.lines.reduce((a, l) => a + l.qty * l.price, 0)
  const margin = state.lines.reduce((a, l) => a + l.qty * (l.price - l.buy), 0)
  return `🏪 ${state.shop?.name ?? state.newShop?.name}${state.shop ? '' : ' (nayi dukan)'}\n${lines.join('\n')}\n\nTotal: ${rs(total)} · ${state.lines.reduce((a, l) => a + l.qty, 0)} peti · margin ${rs(margin)}`
}
async function showCart(chat, state) {
  // UPI into a partner's personal account gets its own button, so the money is tracked as held by that person.
  const personal = (await rpc('bot_money_accounts', {}).catch(() => [])).filter((a) => a.kind === 'personal')
  await send(chat, `${cartText(state)}\n\nAur item ya payment?`, [
    [{ text: '➕ Aur item', callback_data: 's:more' }],
    [{ text: '💵 Cash', callback_data: 's:pay:cash' }, { text: '📱 UPI (company)', callback_data: 's:pay:upi' }],
    ...pairs(personal.map((a) => ({ text: `📱 UPI → ${a.name.replace(/\s*\(personal\)/i, '').slice(0, 20)}`, callback_data: `s:pay:upi:${a.id}` }))),
    [cancelBtn]])
}
const payText = (state) => `${state.mode === 'upi' ? '📱 UPI' : '💵 Cash'} (poora)${state.account ? `\nPaisa aaya: ${state.account.name} 👤` : ''}`
async function showConfirm(chat, state) {
  await send(chat, `${cartText(state)}\nPayment: ${payText(state)}\n\nSahi hai?`, [
    [{ text: '✅ Confirm', callback_data: 's:ok' }],
    [{ text: '➕ Aur item', callback_data: 's:more' }, cancelBtn]])
}

// ---------- typed one-line sale, read by AI ----------
export async function askJson(prompt) {
  // gemini-3.8-flash can hang for 40s+, which kills the 60s webhook, so it is not used; each try is capped at 15s.
  // Free-key rate limits (429) are common when notes come quickly: walk the models twice, with a short pause between rounds.
  for (const round of [0, 1]) {
    if (round) await new Promise((ok) => setTimeout(ok, 2500))
    for (const model of ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest']) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }) })
        const j = await r.json()
        const t = j?.candidates?.[0]?.content?.parts?.[0]?.text
        if (t) return JSON.parse(t)
        console.log('sale-ai', model, r.status, JSON.stringify(j).slice(0, 160))
      } catch (e) { console.log('sale-ai error', model, e.message) }
    }
  }
  throw new Error('AI busy, button wala /sale use karo')
}
// ---------- voice: Gemini hears the clip (free key), then the same text parser runs ----------
/** Audio bytes -> Hinglish text in Roman letters with numbers as digits. Throws a friendly Hinglish error. */
export async function transcribe(buf, mime) {
  if (!buf?.length) throw new Error('Awaaz khali hai, dobara bolo.')
  if (buf.length > 4_000_000) throw new Error('Recording bahut lambi hai. 30 second se chhota bolo.')
  const data = Buffer.from(buf).toString('base64')
  const prompt = `This is a short voice note from an Indian beverage (Pepsi) distributor recording a counter sale, in Hindi, Hinglish or English.
Write exactly what is said, word by word, in Roman (English) letters, Hinglish style. Do not add, guess or correct any word. Write every number as digits (pachaas = 50, saath = 60, chaar sau pachaanve = 495, dedh sau = 150, dhai sau = 250, saade paanch sau = 550).
The first words are usually a shop name (often "<name> Kirana", "<name> General Store", "<name> Traders"); write it as heard.
If there is no clear speech, return an empty text. Return {"text": string}`
  for (const model of ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest']) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: String(mime || 'audio/ogg').split(';')[0], data } }, { text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 } }) })
      const j = await r.json()
      const t = j?.candidates?.[0]?.content?.parts?.[0]?.text
      if (t) { const text = String(JSON.parse(t).text ?? '').trim().slice(0, 500); if (!text) throw Object.assign(new Error('Awaaz samajh nahi aayi, saaf bolo ya likh do.'), { final: true }); return text }
      console.log('voice', model, r.status, JSON.stringify(j).slice(0, 200))
    } catch (e) { if (e.final) throw e; console.log('voice error', model, e.message) }
  }
  throw new Error('Awaaz abhi sun nahi paaya (AI busy). Thodi der me dobara bhejo, ya likh kar /sale karo.')
}

export async function parseLine(text) {
  const [cat, shops, accounts] = await Promise.all([rpc('bot_catalog', {}), rpc('bot_shops', { p_q: null }), rpc('bot_money_accounts', {}).catch(() => [])])
  // Fuzzy shop candidates from the whole note (spoken notes have no ":" and names can be misheard), plus the old prefix search.
  const [guess, all] = await Promise.all([
    rpc('bot_shop_guess', { p_text: text.slice(0, 300) }).catch(() => []),
    rpc('bot_shops', { p_q: text.split(/[:,]/)[0].trim().slice(0, 40) }).catch(() => [])])
  const shopList = [...new Map([...guess, ...all, ...shops].map((s) => [s.id, { id: s.id, name: s.name, phone: s.phone, locality: s.locality }])).values()]
  const out = await askJson(`Parse this Hindi/Hinglish sale note from a beverage distributor into JSON.
Note: """${text}"""
Known shops: ${JSON.stringify(shopList.map((s) => ({ id: s.id, name: s.name, area: s.locality })))}
Pick shop_id only if the note clearly names that shop (a "Shri"/"Shree" prefix may be left out). If no known shop fits, set shop_id null and put the spoken shop name in new_shop_name.
Items: ${JSON.stringify(cat.map((c) => ({ id: c.variant_id, name: c.label, stock: Number(c.on_hand) })))}
If a spoken item fits several items, use the one with stock > 0. If several items with stock > 0 still fit (e.g. "pepsi" with no size), do NOT add that line: put a short Hinglish note in unclear asking which size.
"crate", "case", "peti", "dabba", "carton" all mean one case. A number after @ or "ka"/"rate"/"ke"/"me"/"rupay", or the second number for an item (e.g. "sting 50 crate 495" = 50 cases at 495), is the price per case in rupees.
Numbers may be Hindi words: das 10, bees 20, tees 30, chaalis 40, pachaas 50, saath 60, sattar 70, assi 80, nabbe 90, sau 100, paanch sau 500, chaar sau pachaanve 495, dedh sau 150, dhai sau 250, saade = +half.
"upi", "online", "gpay", "phonepe", "paytm" = upi; "cash", "nakad" = cash. Notes may come from speech, so shop names can be slightly misspelt: match the closest known shop.
Money accounts (where the money went): ${JSON.stringify(accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind })))}
Set account_id only if the note clearly says the payment went to that account (e.g. "upi shobhit", "shobhit ke account me", "shobhit ko bheja", "company account"). A shop name is never an account. Otherwise account_id = null.
Return {"shop_id": id or null, "new_shop_name": string or null, "lines": [{"variant_id": id, "qty": int, "price": number, "sure": boolean}], "mode": "cash"|"upi"|null, "account_id": id or null, "unclear": [short Hinglish notes]}
"sure" is false when you had to guess the size or flavour between several items in stock.
Every line needs BOTH a number of cases and a rate. If either is missing or unclear, do NOT guess it and do NOT add that line: put a short Hinglish note in unclear instead.
Pick the closest item by name (sting = Sting, nimbooz/nimbu = Nimbooz, aq/aquafina 1l = Aquafina 1L, kesar = Creambell Kesar Badam, 400 = 400ml PET flavour). Never invent a line.`)
  const byId = new Map(cat.map((c) => [c.variant_id, c]))
  // A guessed size/flavour is never put on a bill: it becomes a question instead.
  const unsure = (out.lines ?? []).filter((l) => l.sure === false && byId.has(l.variant_id))
  if (unsure.length) out.unclear = [...(out.unclear ?? []), ...unsure.map((l) => `${byId.get(l.variant_id).label}? Size/flavour clear nahi, item khud chuno.`)]
  const lines = (out.lines ?? []).filter((l) => l.sure !== false && byId.has(l.variant_id) && l.qty > 0 && l.price > 0).map((l) => {
    const c = byId.get(l.variant_id)
    return { variant_id: c.variant_id, label: c.label, qty: Math.round(l.qty), price: Math.round(l.price * 100), floor: Number(c.floor_paise), buy: Number(c.buy_paise), stock: Number(c.on_hand) }
  })
  const shop = shopList.find((s) => s.id === out.shop_id)
  // Many shops share a name ("Dewangan Kirana" x7): never let the AI guess between them, make the owner pick.
  const sameName = shop ? await rpc('bot_shops', { p_q: shop.name }).catch(() => []) : []
  const ambiguous = shop && sameName.filter((s) => s.name.toLowerCase() === shop.name.toLowerCase()).length > 1 ? shop.name : null
  // The account must also be named in the note itself (first word of its name, e.g. "shobhit"), so the AI can never invent one.
  const acc = accounts.find((a) => a.id === out.account_id)
  const account = acc && (acc.kind === 'company' || new RegExp(`\\b${acc.name.split(/\s+/)[0].toLowerCase()}`).test(text.toLowerCase())) ? { id: acc.id, name: acc.name, kind: acc.kind } : null
  return { shop: ambiguous ? null : shop, ambiguous, newName: ambiguous ? null : !shop && out.new_shop_name ? String(out.new_shop_name).slice(0, 100) : null, lines, mode: ['cash', 'upi'].includes(out.mode) ? out.mode : account && account.kind !== 'cash' ? 'upi' : null, account, unclear: out.unclear ?? [] }
}

// ---------- entry points ----------
/** Returns true when the update belongs to the sale flow. */
export async function handleSaleMessage(msg) {
  const chat = msg.chat.id, user = msg.from.id, who = msg.from.first_name ?? ''
  const text = (msg.text ?? '').trim()
  const startCmd = /^\/sale\b/i.test(text)
  const state = startCmd ? {} : await getState(user)
  if (!startCmd && state.flow !== 'sale') return false

  try {
    if (startCmd) {
      const rest = text.replace(/^\/sale(@\w+)?/i, '').trim()
      if (!rest) { await setState(user, { flow: 'sale', step: 'shop', lines: [], who }); await showShops(chat); return true }
      await send(chat, '⏳ Padh raha hun…')
      return await saleFromText(chat, user, who, rest)
    }
    return await saleStep(chat, user, state, text)
  } catch (e) { await send(chat, `⚠️ ${String(e.message).slice(0, 200)}`); return true }
}

/** A voice note (or audio file) from an owner: hear it, show what was heard, then the same flow as "/sale <text>". */
export async function handleSaleVoice(msg) {
  const chat = msg.chat.id, user = msg.from.id, who = msg.from.first_name ?? ''
  const a = msg.voice ?? msg.audio ?? (String(msg.document?.mime_type ?? '').startsWith('audio/') ? msg.document : null)
  if (!a) return false
  try {
    if (Number(a.duration) > 90 || Number(a.file_size) > 4_000_000) { await send(chat, '🎤 Recording bahut lambi hai. 30 second se chhota bolo.'); return true }
    await send(chat, '🎤 Sun raha hun…')
    const f = await tg('getFile', { file_id: a.file_id })
    if (!f?.ok) throw new Error('Telegram se awaaz download nahi hui, dobara bhejo.')
    const r = await fetch(`https://api.telegram.org/file/bot${env.KD_BOT_TOKEN}/${f.result.file_path}`, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error('Telegram se awaaz download nahi hui, dobara bhejo.')
    const heard = await transcribe(new Uint8Array(await r.arrayBuffer()), a.mime_type || 'audio/ogg')
    await send(chat, `🎤 Suna: "${heard}"`)
    return await saleFromText(chat, user, who, heard)
  } catch (e) { await send(chat, `⚠️ ${String(e.message).slice(0, 200)}`); return true }
}

async function saleFromText(chat, user, who, rest) {
  {
    {
      const p = await parseLine(rest)
      if (!p.lines.length) { await send(chat, `Item samajh nahi aaye. Aise likho: /sale Sharma Kirana: sting 50 @495, cash\nYa sirf /sale likho aur buttons se karo.${p.unclear.length ? '\n• ' + p.unclear.join('\n• ') : ''}`); return true }
      const next = { flow: 'sale', lines: p.lines, mode: p.mode, account: p.account ?? null, who, shop: p.shop ?? null }
      if (p.ambiguous) {
        next.step = 'shop'; next.pendingName = p.ambiguous; await setState(user, next)
        await send(chat, `"${p.ambiguous}" naam ki kai dukane hain. Kaunsi?`); await showShops(chat, p.ambiguous); return true
      }
      if (!p.shop) {
        if (!p.newName) { next.step = 'shop'; await setState(user, next); await send(chat, 'Dukan samajh nahi aayi.'); await showShops(chat); return true }
        next.newShop = { name: p.newName }; next.step = 'newshop_phone'; await setState(user, next)
        await send(chat, `"${p.newName}" nayi dukan hai. Uska mobile number likho (WhatsApp bill ke liye), ya Skip.`, [[{ text: '⏭️ Skip', callback_data: 's:skip' }, cancelBtn]]); return true
      }
      if (p.unclear.length) await send(chat, '⚠️ Dhyan do:\n• ' + p.unclear.join('\n• '))
      if (next.mode) { next.step = 'confirm'; next.action = randomUUID(); await setState(user, next); await showConfirm(chat, next) } else { next.step = 'cart'; await setState(user, next); await showCart(chat, next) }
      return true
    }
  }
}

async function saleStep(chat, user, state, text) {
  {
    // Other slash commands (/help ...) are not part of a sale: leave the sale open and let the main bot answer.
    if (text.startsWith('/')) return false
    // A long message is not a shop name (e.g. a Pepsi scheme pasted while a sale was open): drop the sale, let the scheme bot read it.
    if (text.length > 60 || text.includes('\n')) { await setState(user, {}); return false }
    if (state.step === 'shop') { await showShops(chat, text.slice(0, 40)); await setState(user, { ...state, pendingName: text.slice(0, 100) }); return true }
    if (state.step === 'newshop_phone') {
      const d = text.replace(/\D/g, '').slice(-10)
      if (!/^[6-9]\d{9}$/.test(d)) { await send(chat, 'Sahi 10 digit number likho, ya Skip.', [[{ text: '⏭️ Skip', callback_data: 's:skip' }, cancelBtn]]); return true }
      return await addShopAndContinue(chat, user, state, d)
    }
    if (state.step === 'qty') {
      const n = text.replace(/[,₹]/g, ' ').match(/\d+(?:\.\d+)?/g) ?? []
      if (n.length < 2) { await send(chat, `Peti aur rate dono likho, jaise: 50 495 (trade ${rs(state.item.trade)})`); return true }
      const qty = Number(n[0]), price = Math.round(Number(n[1]) * 100)
      if (!(Number.isInteger(qty) && qty >= 1 && qty <= 9999 && price >= 2000)) { await send(chat, 'Peti poori sankhya me likho (jaise 50), aur rate rupaye me. Jaise: 50 495'); return true }
      const lines = [...state.lines.filter((l) => l.variant_id !== state.item.variant_id),
        { variant_id: state.item.variant_id, label: state.item.label, qty, price, floor: state.item.floor, buy: state.item.buy, stock: state.item.stock }]
      const next = { ...state, lines, item: null, step: 'cart' }
      await setState(user, next); await showCart(chat, next); return true
    }
    await send(chat, 'Upar ke buttons use karo, ya ❌ Cancel.')
    return true
  }
}

async function addShopAndContinue(chat, user, state, phone) {
  try {
    const id = await rpc('bot_add_shop', { p_name: state.newShop.name, p_phone: phone })
    const next = { ...state, shop: { id, name: state.newShop.name, phone }, newShop: null }
    await send(chat, `✅ Dukan jodi: ${state.newShop.name}${phone ? ' · ' + phone : ''}`)
    if (next.lines.length) { next.step = next.mode ? 'confirm' : 'cart'; if (next.mode) next.action = randomUUID(); await setState(user, next); await (next.mode ? showConfirm : showCart)(chat, next) }
    else { next.step = 'item'; await setState(user, next); await showItems(chat, next) }
  } catch (e) {
    const m = String(e.message)
    await send(chat, m.includes('PHONE_EXISTS') ? 'Ye number pehle se kisi dukan ka hai. Dusra number likho ya Skip.' : m.includes('BAD_PHONE') ? 'Number sahi nahi. 10 digit likho ya Skip.' : `⚠️ ${m.slice(0, 200)}`,
      [[{ text: '⏭️ Skip', callback_data: 's:skip' }, cancelBtn]])
  }
  return true
}

/** Button taps whose data starts with "s:". */
export async function handleSaleTap(q) {
  const chat = q.message.chat.id, user = q.from.id
  await tg('answerCallbackQuery', { callback_query_id: q.id })
  const [, action, arg, arg2] = q.data.split(':')
  const state = await getState(user)
  if (action === 'cancel') { await setState(user, {}); await send(chat, '❌ Sale cancel. Kuch save nahi hua.'); return }
  if (state.flow !== 'sale') { await send(chat, 'Ye sale purani ho gayi. Naya /sale shuru karo.'); return }
  try {
    // Buttons that need a shop first (an old message tapped after /sale was restarted).
    if (['item', 'more', 'pay', 'ok'].includes(action) && !state.shop?.id) { await send(chat, 'Pehle dukan chuno.'); await showShops(chat); return }
    if (action === 'shop') {
      const shops = await rpc('bot_shops', { p_q: null })
      let shop = shops.find((s) => s.id === arg)
      if (!shop) { const more = state.pendingName ? await rpc('bot_shops', { p_q: state.pendingName }) : []; shop = more.find((s) => s.id === arg) }
      if (!shop) { await send(chat, 'Dukan nahi mili, dobara chuno.'); await showShops(chat); return }
      const next = { ...state, shop, step: state.lines.length ? (state.mode ? 'confirm' : 'cart') : 'item', ...(state.lines.length && state.mode ? { action: randomUUID() } : {}) }
      await setState(user, next)
      if (next.step === 'item') await showItems(chat, next); else await (next.mode ? showConfirm : showCart)(chat, next)
      return
    }
    if (action === 'add') {
      const name = (state.pendingName ?? '').trim()
      if (name.length < 2) { await send(chat, 'Pehle dukan ka naam likho.'); return }
      await setState(user, { ...state, newShop: { name }, step: 'newshop_phone' })
      await send(chat, `"${name}" ka mobile number likho (WhatsApp bill ke liye), ya Skip.`, [[{ text: '⏭️ Skip', callback_data: 's:skip' }, cancelBtn]])
      return
    }
    if (action === 'skip') { await addShopAndContinue(chat, user, state, null); return }
    if (action === 'item') {
      const c = (await rpc('bot_catalog', {})).find((x) => x.variant_id === arg)
      if (!c) { await send(chat, 'Item nahi mila.'); return }
      await setState(user, { ...state, step: 'qty', item: { variant_id: c.variant_id, label: c.label, trade: Number(c.trade_paise), floor: Number(c.floor_paise), buy: Number(c.buy_paise), stock: Number(c.on_hand) } })
      await send(chat, `${c.label}\nStock: ${c.on_hand} peti · trade ${rs(c.trade_paise)} · loss se neeche: ${rs(c.floor_paise)}\n\nKitni peti aur kis rate? Jaise: 50 495`, [[cancelBtn]])
      return
    }
    if (action === 'more') { await setState(user, { ...state, step: 'item' }); await showItems(chat, state); return }
    if (action === 'pay') {
      if (!state.lines.length) { await send(chat, 'Pehle koi item jodo.'); return }
      const acc = arg2 ? (await rpc('bot_money_accounts', {})).find((a) => a.id === arg2) : null
      if (arg2 && !acc) { await send(chat, 'Ye account ab band hai. Dobara payment chuno.'); await showCart(chat, state); return }
      const next = { ...state, mode: arg === 'upi' ? 'upi' : 'cash', account: acc ? { id: acc.id, name: acc.name, kind: acc.kind } : null, step: 'confirm', action: randomUUID() }
      await setState(user, next); await showConfirm(chat, next); return
    }
    if (action === 'ok') {
      if (!state.shop?.id || !state.lines.length || !state.mode) { await send(chat, 'Sale adhoori hai, dobara /sale karo.'); return }
      if (!state.action) { await send(chat, 'Sale adhoori hai, dobara /sale karo.'); return }
      // The bill id was fixed when the confirm screen was shown, so a double tap can only ever save one bill.
      const r = await rpc('bot_record_sale_into', { p_action: state.action, p_shop: state.shop.id, p_mode: state.mode, p_by: state.who ?? '', p_account: state.account?.id ?? null,
        p_lines: state.lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, price_paise: l.price })) })
      await setState(user, {})
      if (r.repeat) { await send(chat, `Ye bill pehle hi save ho chuka hai: ${r.number} (${rs(r.total_paise)}).`); return }
      // Signed link to the bill PDF (opens without login, only this bill) for the shop's WhatsApp.
      const link = r.id ? `https://kdfoods.vercel.app/api/bill-pdf?id=${r.id}&t=${billToken(r.id, env.KD_BOT_KEY)}` : null
      const bill = [`*K.D. Foods* — Bill ${r.number}`, new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }), state.shop.name, '',
        ...state.lines.map((l) => `${l.label} × ${l.qty} @ ${rs(l.price)} = ${rs(l.qty * l.price)}`), '',
        `Total: ${rs(r.total_paise)} (${state.mode === 'upi' ? 'UPI' : 'Cash'}, paid)`, ...(link ? ['', `Bill PDF: ${link}`] : []), 'Dhanyavaad 🙏 · 96300 12636'].join('\n')
      const wa = state.shop.phone ? `https://wa.me/91${state.shop.phone}?text=${encodeURIComponent(bill)}` : null
      // Money that went into a partner's own account: say how much company money they now hold.
      let held = ''
      if (state.account?.kind === 'personal') {
        const h = (await rpc('bot_money_holdings', {}).catch(() => [])).find((x) => x.account_id === state.account.id)
        if (h) held = `\n👤 Paisa ${state.account.name} ke account me aaya. Unke paas ab company ka ${rs(h.holding_paise)} hai, company bank me daal dena.`
      }
      await send(chat, `✅ Sale save: ${r.number} · ${rs(r.total_paise)}${r.margin_paise != null ? ` · margin ${rs(r.margin_paise)}` : ''}\nStock kam ho gaya, sheet me 1 minute me aa jayega.${held}`,
        wa ? [[{ text: '📩 WhatsApp bill bhejo', url: wa }]] : undefined)
      // The GST bill as a PDF in the group (best effort: a failure here never undoes the sale).
      if (r.id) await sendBillPdf(chat, r.id).catch((e) => console.log('bill pdf', e.message))
      return
    }
  } catch (e) { await send(chat, `⚠️ ${String(e.message).slice(0, 200)}`) }
}
