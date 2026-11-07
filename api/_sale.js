// Telegram counter-sale flow for the K.D. Foods bot (imported by api/scheme-tg.js; "_" files are not routes).
// Two ways in: "/sale" -> buttons (shop -> item -> cases + price -> cash/UPI -> confirm),
//              "/sale Sharma Kirana: sting 50 @495, nimbooz 30 @515, cash" -> AI reads it -> same confirm screen.
// Every DB call goes through key-checked RPCs (KD_BOT_KEY), so no service key lives in Vercel.
import { randomUUID } from 'node:crypto'

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
  const lines = state.lines.map((l, i) => `${i + 1}. ${l.label}: ${l.qty} × ${rs(l.price)} = ${rs(l.qty * l.price)}${l.price < l.floor ? `  ⚠️ loss (floor ${rs(l.floor)})` : ''}`)
  const total = state.lines.reduce((a, l) => a + l.qty * l.price, 0)
  const margin = state.lines.reduce((a, l) => a + l.qty * (l.price - l.buy), 0)
  return `🏪 ${state.shop?.name ?? state.newShop?.name}${state.shop ? '' : ' (nayi dukan)'}\n${lines.join('\n')}\n\nTotal: ${rs(total)} · ${state.lines.reduce((a, l) => a + l.qty, 0)} peti · margin ${rs(margin)}`
}
async function showCart(chat, state) {
  await send(chat, `${cartText(state)}\n\nAur item ya payment?`, [
    [{ text: '➕ Aur item', callback_data: 's:more' }],
    [{ text: '💵 Cash', callback_data: 's:pay:cash' }, { text: '📱 UPI', callback_data: 's:pay:upi' }],
    [cancelBtn]])
}
async function showConfirm(chat, state) {
  await send(chat, `${cartText(state)}\nPayment: ${state.mode === 'upi' ? '📱 UPI' : '💵 Cash'} (poora)\n\nSahi hai?`, [
    [{ text: '✅ Confirm', callback_data: 's:ok' }],
    [{ text: '➕ Aur item', callback_data: 's:more' }, cancelBtn]])
}

// ---------- typed one-line sale, read by AI ----------
async function askJson(prompt) {
  // gemini-3.8-flash can hang for 40s+, which kills the 60s webhook, so it is not used; each try is capped at 15s.
  for (const model of ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest']) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }) })
      const j = await r.json()
      const t = j?.candidates?.[0]?.content?.parts?.[0]?.text
      if (t) return JSON.parse(t)
    } catch { /* next model */ }
  }
  throw new Error('AI busy, button wala /sale use karo')
}
async function parseLine(text) {
  const [cat, shops] = await Promise.all([rpc('bot_catalog', {}), rpc('bot_shops', { p_q: null })])
  const all = await rpc('bot_shops', { p_q: text.split(/[:,]/)[0].trim().slice(0, 40) }).catch(() => [])
  const shopList = [...new Map([...all, ...shops].map((s) => [s.id, s])).values()]
  const out = await askJson(`Parse this Hindi/Hinglish sale note from a beverage distributor into JSON.
Note: """${text}"""
Known shops: ${JSON.stringify(shopList.map((s) => ({ id: s.id, name: s.name })))}
Items: ${JSON.stringify(cat.map((c) => ({ id: c.variant_id, name: c.label })))}
"crate", "case", "peti" all mean one case. A number after @ or "ka"/"rate" is the price per case in rupees.
Return {"shop_id": id or null, "new_shop_name": string or null, "lines": [{"variant_id": id, "qty": int, "price": number}], "mode": "cash"|"upi"|null, "unclear": [short Hinglish notes]}
Pick the closest item by name (sting = Sting, nimbooz/nimbu = Nimbooz, aq/aquafina 1l = Aquafina 1L, kesar = Creambell Kesar Badam, 400 = 400ml PET flavour). Never invent a line.`)
  const byId = new Map(cat.map((c) => [c.variant_id, c]))
  const lines = (out.lines ?? []).filter((l) => byId.has(l.variant_id) && l.qty > 0 && l.price > 0).map((l) => {
    const c = byId.get(l.variant_id)
    return { variant_id: c.variant_id, label: c.label, qty: Math.round(l.qty), price: Math.round(l.price * 100), floor: Number(c.floor_paise), buy: Number(c.buy_paise) }
  })
  const shop = shopList.find((s) => s.id === out.shop_id)
  return { shop, newName: !shop && out.new_shop_name ? String(out.new_shop_name).slice(0, 100) : null, lines, mode: ['cash', 'upi'].includes(out.mode) ? out.mode : null, unclear: out.unclear ?? [] }
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
      const p = await parseLine(rest)
      if (!p.lines.length) { await send(chat, `Item samajh nahi aaye. Aise likho: /sale Sharma Kirana: sting 50 @495, cash\nYa sirf /sale likho aur buttons se karo.${p.unclear.length ? '\n• ' + p.unclear.join('\n• ') : ''}`); return true }
      const next = { flow: 'sale', lines: p.lines, mode: p.mode, who, shop: p.shop ?? null }
      if (!p.shop) {
        if (!p.newName) { next.step = 'shop'; await setState(user, next); await send(chat, 'Dukan samajh nahi aayi.'); await showShops(chat); return true }
        next.newShop = { name: p.newName }; next.step = 'newshop_phone'; await setState(user, next)
        await send(chat, `"${p.newName}" nayi dukan hai. Uska mobile number likho (WhatsApp bill ke liye), ya Skip.`, [[{ text: '⏭️ Skip', callback_data: 's:skip' }, cancelBtn]]); return true
      }
      if (p.unclear.length) await send(chat, '⚠️ Dhyan do:\n• ' + p.unclear.join('\n• '))
      if (next.mode) { next.step = 'confirm'; await setState(user, next); await showConfirm(chat, next) } else { next.step = 'cart'; await setState(user, next); await showCart(chat, next) }
      return true
    }

    if (state.step === 'shop') { await showShops(chat, text.slice(0, 40)); await setState(user, { ...state, pendingName: text.slice(0, 100) }); return true }
    if (state.step === 'newshop_phone') {
      const d = text.replace(/\D/g, '').slice(-10)
      if (!/^[6-9]\d{9}$/.test(d)) { await send(chat, 'Sahi 10 digit number likho, ya Skip.', [[{ text: '⏭️ Skip', callback_data: 's:skip' }, cancelBtn]]); return true }
      return await addShopAndContinue(chat, user, state, d)
    }
    if (state.step === 'qty') {
      const n = text.replace(/[,₹]/g, ' ').match(/\d+(?:\.\d+)?/g) ?? []
      if (n.length < 2) { await send(chat, `Peti aur rate dono likho, jaise: 50 495 (trade ${rs(state.item.trade)})`); return true }
      const qty = Math.round(Number(n[0])), price = Math.round(Number(n[1]) * 100)
      if (!(qty >= 1 && qty <= 9999 && price >= 100)) { await send(chat, 'Number sahi nahi lage. Jaise: 50 495'); return true }
      const lines = [...state.lines.filter((l) => l.variant_id !== state.item.variant_id),
        { variant_id: state.item.variant_id, label: state.item.label, qty, price, floor: state.item.floor, buy: state.item.buy }]
      const next = { ...state, lines, item: null, step: 'cart' }
      await setState(user, next); await showCart(chat, next); return true
    }
    await send(chat, 'Upar ke buttons use karo, ya ❌ Cancel.')
    return true
  } catch (e) { await send(chat, `⚠️ ${String(e.message).slice(0, 200)}`); return true }
}

async function addShopAndContinue(chat, user, state, phone) {
  try {
    const id = await rpc('bot_add_shop', { p_name: state.newShop.name, p_phone: phone })
    const next = { ...state, shop: { id, name: state.newShop.name, phone }, newShop: null }
    await send(chat, `✅ Dukan jodi: ${state.newShop.name}${phone ? ' · ' + phone : ''}`)
    if (next.lines.length) { next.step = next.mode ? 'confirm' : 'cart'; await setState(user, next); await (next.mode ? showConfirm : showCart)(chat, next) }
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
  const [, action, arg] = q.data.split(':')
  const state = await getState(user)
  if (action === 'cancel') { await setState(user, {}); await send(chat, '❌ Sale cancel. Kuch save nahi hua.'); return }
  if (state.flow !== 'sale') { await send(chat, 'Ye sale purani ho gayi. Naya /sale shuru karo.'); return }
  try {
    if (action === 'shop') {
      const shops = await rpc('bot_shops', { p_q: null })
      let shop = shops.find((s) => s.id === arg)
      if (!shop) { const more = state.pendingName ? await rpc('bot_shops', { p_q: state.pendingName }) : []; shop = more.find((s) => s.id === arg) }
      if (!shop) { await send(chat, 'Dukan nahi mili, dobara chuno.'); await showShops(chat); return }
      const next = { ...state, shop, step: state.lines.length ? (state.mode ? 'confirm' : 'cart') : 'item' }
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
      await setState(user, { ...state, step: 'qty', item: { variant_id: c.variant_id, label: c.label, trade: Number(c.trade_paise), floor: Number(c.floor_paise), buy: Number(c.buy_paise) } })
      await send(chat, `${c.label}\nStock: ${c.on_hand} peti · trade ${rs(c.trade_paise)} · loss se neeche: ${rs(c.floor_paise)}\n\nKitni peti aur kis rate? Jaise: 50 495`, [[cancelBtn]])
      return
    }
    if (action === 'more') { await setState(user, { ...state, step: 'item' }); await showItems(chat, state); return }
    if (action === 'pay') {
      if (!state.lines.length) { await send(chat, 'Pehle koi item jodo.'); return }
      const next = { ...state, mode: arg === 'upi' ? 'upi' : 'cash', step: 'confirm' }
      await setState(user, next); await showConfirm(chat, next); return
    }
    if (action === 'ok') {
      if (!state.shop?.id || !state.lines.length || !state.mode) { await send(chat, 'Sale adhoori hai, dobara /sale karo.'); return }
      const action_id = state.action ?? randomUUID()
      await setState(user, { ...state, action: action_id })
      const r = await rpc('bot_record_sale', { p_action: action_id, p_shop: state.shop.id, p_mode: state.mode, p_by: state.who ?? '',
        p_lines: state.lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, price_paise: l.price })) })
      await setState(user, {})
      const bill = [`*K.D. Foods* — Bill ${r.number}`, new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }), state.shop.name, '',
        ...state.lines.map((l) => `${l.label} × ${l.qty} @ ${rs(l.price)} = ${rs(l.qty * l.price)}`), '',
        `Total: ${rs(r.total_paise)} (${state.mode === 'upi' ? 'UPI' : 'Cash'}, paid)`, 'Dhanyavaad 🙏 · 96300 12636'].join('\n')
      const wa = state.shop.phone ? `https://wa.me/91${state.shop.phone}?text=${encodeURIComponent(bill)}` : null
      await send(chat, `✅ Sale save: ${r.number} · ${rs(r.total_paise)}${r.margin_paise != null ? ` · margin ${rs(r.margin_paise)}` : ''}\nStock kam ho gaya, sheet me 1 minute me aa jayega.`,
        wa ? [[{ text: '📩 WhatsApp bill bhejo', url: wa }]] : undefined)
      return
    }
  } catch (e) { await send(chat, `⚠️ ${String(e.message).slice(0, 200)}`) }
}
