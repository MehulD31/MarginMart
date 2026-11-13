// Pure helpers for the autopilot messages (no network, unit-tested in format.test.mjs).

// The catalogue sometimes stores the pack and flavour as the same words ("Slice 200ml RGB Slice 200ml RGB") -> show once.
export const item = (s) => {
  const w = String(s ?? '').trim().split(/\s+/)
  const h = w.length / 2
  return Number.isInteger(h) && h > 0 && w.slice(0, h).join(' ') === w.slice(h).join(' ') ? w.slice(0, h).join(' ') : String(s ?? '').trim()
}

// "98765 43210" / "+91 9876543210" / "09876543210" -> "919876543210" (India mobile), or null.
export const waNumber = (phone) => {
  const d = String(phone ?? '').replace(/\D/g, '')
  const last10 = d.slice(-10)
  return /^[6-9]\d{9}$/.test(last10) ? `91${last10}` : null
}

export const waLink = (phone, text) => {
  const n = waNumber(phone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null
}

export const remindText = (shop, amountRupees) =>
  `Namaste ${shop}, K.D. Foods se. Aapka ${amountRupees} baki hai. Kripya jaldi bhej dein. Dhanyavaad. Rate aur offers ke liye MarginMart WhatsApp group join karein: https://chat.whatsapp.com/L2oweV0q01131uUae2RpLu`

// A message the owner can forward to the Pepsi sales officer as-is.
// Uses Pepsi's own SKU code + name from their portal when we know it, so their sales officer can enter it without guessing.
export const reorderText = (rows, dateLabel) =>
  `Pepsi order ${dateLabel}:\n` + rows.map((r) => `• ${r.pepsi_sku ? `${r.pepsi_sku} ${r.pepsi_name}` : item(r.item)}: ${r.need} peti`).join('\n')

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Owner-only card above the forwardable order (Telegram HTML): urgent items first, each with stock and days left,
// then the total cost and what the numbers are based on.
/** How full is the Pepsi truck? weights: Map sku_code -> kg per case (portal gross_weight). Rows without a portal SKU or weight are counted in `unknown`.
 * Pepsi sizes orders to one truck (8,000 kg here) and adds filler when it is under ~70% (portal setting filler_truck_threshold). */
export const truckLoad = (rows, weights, cap = 8000) => {
  let kg = 0, unknown = 0
  for (const r of rows) {
    const w = weights.get(String(r.pepsi_sku ?? ''))
    if (w > 0) kg += w * (Number(r.need) || 0); else unknown++
  }
  return { kg: Math.round(kg), cap, pct: cap > 0 ? Math.round((kg / cap) * 100) : 0, unknown }
}
export const truckLine = (t) => {
  if (!t || t.kg <= 0) return ''
  const base = `🚚 Truck: ~<b>${t.kg.toLocaleString('en-IN')} kg</b> = <b>${t.pct}%</b> of ${t.cap.toLocaleString('en-IN')} kg`
  const tail = t.pct < 70 ? ' ⚠️ 70% se kam: Pepsi filler maal jod sakta hai ya order chhota maan sakta hai'
    : t.pct > 100 ? ` · ~${Math.ceil(t.pct / 100)} truck ka order` : ' ✅ ek truck bhar jayega'
  return base + tail + (t.unknown ? ` (${t.unknown} item ka wazan nahi mila, kuch zyada ho sakta hai)` : '')
}
// credit: { paise, at } from the Pepsi portal (optional) -> how much to pay Pepsi before this order can go.
// truck: result of truckLoad (optional).
export const reorderCard = (rows, rs, dateLabel, credit = null, truck = null) => {
  const line = (r) => {
    const out = Number(r.on_hand) <= 0
    const days = out || r.days_left == null ? '' : `~${Math.round(Number(r.days_left))} din chalega`
    const pd = Number(r.per_day)
    const sells = pd >= 1 ? `roz ~${Math.round(pd)} peti bikta hai` : pd > 0 ? `hafte me ~${Math.max(1, Math.round(pd * 7))} peti bikta hai` : ''
    const meta = [out ? 'stock khatam' : `stock ${r.on_hand} peti`, days, sells, r.thin ? 'kam data' : ''].filter(Boolean).join(' · ')
    return `▸ <b>${esc(item(r.item))}</b> — <b>${r.need} peti</b>\n    <i>${meta}</i>`
  }
  const urgent = rows.filter((r) => r.urgent), rest = rows.filter((r) => !r.urgent)
  const cost = rows.reduce((a, r) => a + (Number(r.cost_paise) || 0), 0)
  // rows priced from the portal carry pepsi_sku (price incl. GST, what Pepsi bills); the rest fall back to our average cost
  const unpriced = rows.filter((r) => Number(r.cost_paise) > 0 && !r.pepsi_sku).length
  return [
    `📝 <b>Pepsi Order${dateLabel ? ' · ' + esc(dateLabel) : ''}</b>`,
    `${rows.length} item${cost > 0 ? ` · kul ~<b>${rs(cost)}</b> ka maal` : ''}`,
    credit && cost > 0 ? (credit.paise >= cost
      ? `✅ Pepsi credit ${rs(credit.paise)} hai, order chal jayega`
      : `💳 Pepsi credit sirf ${rs(credit.paise)}. Order se pehle ~<b>${rs(cost - credit.paise)}</b> Pepsi ko bhejna hoga`) : '',
    truckLine(truck),
    unpriced ? `⚠️ ${unpriced} item ka rate portal se match nahi hua, unka hisaab hamare average cost se hai (GST ke bina ho sakta hai). Asli bill ~20% tak zyada ho sakta hai.` : '',
    urgent.length ? `\n🔴 <b>Abhi chahiye</b> (delivery aane se pehle khatam)\n${urgent.map(line).join('\n')}` : '',
    rest.length ? `\n🟡 <b>Is hafte ke liye</b>\n${rest.map(line).join('\n')}` : '',
    '\n<i>Pichhle hafte ki bikri, trend, season aur delivery time ke hisaab se.</i>',
    '👇 Neeche wala message Pepsi ko forward karo',
  ].filter(Boolean).join('\n')
}
// Low stock but nothing sold in 30 days: not ordered automatically, the owner decides (owner, 12 Nov 2026).
export const idleLowText = (rows) =>
  rows?.length ? `🧊 Stock kam hai par 30 din me bika nahi (${rows.length}). Ye order me nahi daale, aap decide karo:\n` + rows.map((r) => `• ${item(r.item)}: ${r.on_hand} peti`).join('\n') : ''

const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (columns, rows) =>
  [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n'

// IST month boundaries as ISO strings for PostgREST filters. month = 1..12.
export const monthRange = (year, month) => {
  const pad = (n) => String(n).padStart(2, '0')
  const next = month === 12 ? [year + 1, 1] : [year, month + 1]
  return { from: `${year}-${pad(month)}-01T00:00:00+05:30`, to: `${next[0]}-${pad(next[1])}-01T00:00:00+05:30`, label: `${year}-${pad(month)}` }
}
