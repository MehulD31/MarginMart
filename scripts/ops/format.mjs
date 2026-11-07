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
  `Namaste ${shop}, K.D. Foods se. Aapka ${amountRupees} baki hai. Kripya jaldi bhej dein. Dhanyavaad.`

// A message the owner can forward to the Pepsi sales officer as-is.
export const reorderText = (rows, dateLabel) =>
  `Pepsi order ${dateLabel}:\n` + rows.map((r) => `• ${item(r.item)}: ${r.need} peti`).join('\n')

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
