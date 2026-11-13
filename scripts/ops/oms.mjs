// Varun Beverages distributor portal (oms.rjcorp.in, built by EY "Asterisk") - READ-ONLY client (owner, 13 Nov 2026).
// Plain JSON API: POST auth/login -> { token, expires_on: hours }, then `authorization: <token>` on every call.
// The portal allows ONE session per user: loginCurrentSystem:true takes it over (the person on the website is logged out),
// so we log in briefly, read, and log out. Nothing here creates, saves or submits an order.
const B = 'https://oms.rjcorp.in/v1/api/'

export async function omsLogin(username, password) {
  const r = await fetch(B + 'auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, loginCurrentSystem: true }) })
  const j = await r.json().catch(() => ({}))
  if (j.response !== 'SUCCESS' || !j.token) throw new Error(`OMS login failed: ${j.message ?? j.response ?? r.status}`)
  const token = j.token
  const node = null
  const call = async (path, body, method = 'POST') => {
    const res = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', authorization: token }, ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }) })
    if (!res.ok) throw new Error(`OMS ${path}: HTTP ${res.status}`)
    return res.json()
  }
  return { token, user: j.user, node, call, logout: () => call('auth/logout', {}).catch(() => null) }
}

/** Everything useful for MarginMart in one read. `node` is the distributor (sold-to) code. */
export async function omsSnapshot(s) {
  const hier = await s.call('ocp/get-receiver-hierarchy', { tool: 'OCP' })
  const node = hier.receiver_hierarchy?.[0]?.node_code
  if (!node) throw new Error('OMS: no distributor code')
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const [skus, prices, credit, schemes, history, pdp, vehicles] = await Promise.all([
    s.call('ocp/get-sku-masters', { receiver_node_code: [node] }),
    s.call('pricing/get_price_list', { filters: { customer_code: node, ship_to_party: node, payer: node } }),
    s.call('ocp/get-credit-stats', { node_code: node, order_number: null, is_allocated: false }),
    s.call('ocp/get-sku-schemes', { receiver_node_code: node, tool: 'OMS' }),
    s.call('ocp_op/get-portal-order-history', null, 'GET'),
    s.call('ocp/get-next-two-pdp-dates', { receiver_node_code: node, status_date: today }).catch(() => null),
    s.call('ocp_op/get-node-vehicles', { ship_to: node }).catch(() => null),
  ])
  return { node, name: hier.receiver_hierarchy[0].node_description, skus: skus.skus_data ?? [], prices: Array.isArray(prices) ? prices : Object.values(prices ?? {}),
    credit: credit.data ?? null, schemes: schemes.sku_schemes ?? [], orders: history.order_history ?? [], pdp, vehicles: vehicles?.node_vehicles ?? [] }
}

/** One row per orderable SKU with its current price (rupees per case incl. GST). Several price rows can exist per SKU; keep the highest positive one. */
export function omsItems(snap) {
  const price = new Map()
  for (const p of snap.prices) {
    const v = Number(p.price) || 0
    if (v > 0 && v > (price.get(p.sku_code)?.price ?? 0)) price.set(p.sku_code, { price: v, base: Number(p.base_price) || 0, tax: Number(p.base_tax) || 0 })
  }
  return snap.skus.map((s) => ({
    sku_code: String(s.sku_code), description: s.sku_description, child: s.child_sku_description ?? null, mrp: Number(s.mrp) || null,
    units_per_case: Number(s.factor_Case_BT) || null, weight_kg: Number(s.gross_weight) || null, brand: s.h6 ?? null, flavour: s.h8 ?? null, size: s.h9 ?? null, pack: s.h10 ?? null,
    price_paise: price.has(String(s.sku_code)) ? Math.round(price.get(String(s.sku_code)).price * 100) : null,
    base_paise: price.has(String(s.sku_code)) ? Math.round(price.get(String(s.sku_code)).base * 100) : null,
    tax_paise: price.has(String(s.sku_code)) ? Math.round(price.get(String(s.sku_code)).tax * 100) : null,
  }))
}

// ---- matching portal SKUs to our catalogue (pure, unit-tested) ----
const norm = (s) => String(s ?? '').toUpperCase().replace(/MOUNTAIN DEW|MDEW|MTN DEW/g, 'MDEW').replace(/7 ?UP/g, '7UP').replace(/PEPSI BLACK|BLACK COLA/g, 'PBLACK')
  .replace(/(\d+(?:\.\d+)?)\s*(ML|L|LTR)\b/g, (_, n, u) => (u === 'ML' ? `${Number(n)}ML` : `${Number(n) * 1000}ML`))
const sizeOf = (s) => norm(s).match(/(\d+)ML/)?.[1] ?? null
const packOf = (s) => (/\bCAN\b/i.test(s) ? 'CAN' : /\bRGB\b|GLASS/i.test(s) ? 'RGB' : /TETRA/i.test(s) ? 'TETRA' : /\bBIB\b/i.test(s) ? 'BIB' : 'PET')
// Order matters: more specific names first (Nimbooz before 7UP, Pepsi Black before Pepsi). Fruitz is Tropicana's; our "Soda" is Lehar Evervess.
const BRANDS = [['NJS', /\bNJS\b|JEERA/], ['NIMBOOZ', /NIMBOO?Z/], ['PBLACK', /PBLACK/], ['MDEW', /MDEW/], ['7UP', /7UP/], ['MIRINDA', /MIRINDA/], ['PEPSI', /PEPSI/],
  ['STING', /STING/], ['SLICE', /SLICE/], ['AQUAFINA', /AQUAFINA/], ['AQUAVESS', /AQUAVESS/], ['CREAMBELL', /CREAMBELL/], ['TROP', /TROP|FRUITZ|FRUTZ/],
  ['GATORADE', /GATORADE/], ['SODA', /LEHAR|EVERVESS|SODA|TONIC|GINGER/], ['ADRUSH', /AD RUSH|ADRENALINE/]]
const brandOf = (s) => BRANDS.find(([, re]) => re.test(norm(s)))?.[0] ?? null
const words = (s) => new Set(norm(s).split(/[^A-Z0-9]+/).filter((w) => w.length > 2 && !/^\d+ML$/.test(w)))

/** Best portal SKU for one of our items, or null. Brand, size and pack must agree (size may be missing only if the MRP matches);
 * then most shared words, same MRP preferred. The brand comes from the main description (the alternate name can say "7 UP NIMBOZ"). */
export function matchSku(ourLabel, ourMrp, items) {
  const b = brandOf(ourLabel), z = sizeOf(ourLabel), pk = packOf(ourLabel), w = words(ourLabel)
  if (!b) return null
  let best = null
  for (const it of items) {
    const t = `${it.description} ${it.child ?? ''}`
    if (brandOf(it.description) !== b || packOf(t) !== pk) continue
    if (z ? sizeOf(it.description) !== z : !(ourMrp && it.mrp && Math.round(ourMrp) === Math.round(it.mrp))) continue
    let score = 0
    for (const x of words(t)) if (w.has(x)) score += 2       // a shared flavour word (CRANBERRY) beats a matching MRP
    if (ourMrp && it.mrp && Math.round(ourMrp) === Math.round(it.mrp)) score += 1
    if (it.price_paise) score += 0.5
    if (!best || score > best.score) best = { it, score }
  }
  return best?.it ?? null
}

// ---- diffs between two syncs (pure, unit-tested) ----
/** Price changes for SKUs we already knew (new SKUs are not "changes"). prev: Map sku_code -> price_paise. */
export function priceChanges(prev, items) {
  return items.filter((i) => i.price_paise && prev.has(i.sku_code) && prev.get(i.sku_code) && prev.get(i.sku_code) !== i.price_paise)
    .map((i) => ({ sku_code: i.sku_code, description: i.description, old: prev.get(i.sku_code), now: i.price_paise }))
}

// The order-history list was empty when this was written, so read the obvious field names defensively.
const pick = (o, ...ks) => { for (const k of ks) if (o?.[k] != null && o[k] !== '') return o[k]; return null }
export const orderKey = (o) => String(pick(o, 'order_number', 'order_no', 'orderNumber', 'id') ?? JSON.stringify(o).slice(0, 80))
export const orderView = (o) => ({
  key: orderKey(o), status: pick(o, 'order_status', 'status', 'orderStatus'), value: Number(pick(o, 'order_value', 'orderValue', 'total_value')) || null,
  qty: Number(pick(o, 'order_qty', 'orderQty', 'total_qty')) || null, invoice: pick(o, 'invoice_no', 'invoice_number', 'invoiceNo'),
  at: pick(o, 'order_timestamp', 'created_at', 'order_date'),
})
/** What changed in the order list: new orders, and orders that got an invoice number or a new status. */
export function orderEvents(prevOrders, orders) {
  const before = new Map((prevOrders ?? []).map((o) => [orderKey(o), orderView(o)]))
  const out = []
  for (const o of orders ?? []) {
    const v = orderView(o), b = before.get(v.key)
    if (!b) out.push({ kind: 'new', ...v })
    else if (v.invoice && !b.invoice) out.push({ kind: 'invoiced', ...v })
    else if (v.status && v.status !== b.status) out.push({ kind: 'status', from: b.status, ...v })
  }
  return out
}

// ---- reports (End to End + Order Summary): Pepsi's order -> allocation -> invoice trail ----
const day = (s) => (s && !/^NaT|nan$/i.test(String(s)) ? String(s).slice(0, 10) : null)
const num = (x) => Number(x) || 0
/** Read a report (all pages). Dates are YYYY-MM-DD. */
export async function omsReport(s, id, from, to, extra = {}) {
  const rows = []
  for (let page = 1; page <= 20; page++) {
    const r = await s.call(`report_server_filters/report-data/${id}`, { sort_by: '', records_per_page: '500', page_number: String(page), from_date: from, to_date: to, ...extra })
    rows.push(...(r.data ?? []))
    if (!r.data?.length || rows.length >= Number(r.total ?? 0)) break
  }
  return rows
}
/** Invoice lines from the End to End report, one per invoice + SKU. */
export function invoiceLines(e2e) {
  const m = new Map()
  for (const r of e2e) {
    const no = String(r['Invoice Number Sap'] ?? '').trim()
    if (!no || /^nan$/i.test(no) || !num(r['Invoiced Quantity Sap'])) continue
    const k = `${no}|${r['Sku Code']}`
    const x = m.get(k) ?? { invoice_no: no, sku_code: String(r['Sku Code']), description: r['Sku Description'], invoiced_on: day(r['Invoiced Date Sap']),
      order_no: r['Requested Order Number'] ?? null, qty: 0, value_paise: 0 }
    x.qty += num(r['Invoiced Quantity Sap']); x.value_paise += Math.round(num(r['Invoiced Value Sap']) * 100)
    m.set(k, x)
  }
  return [...m.values()]
}
/** Which kind of line is this? Pepsi writes the order type as text, sometimes several ("General Order, Range SKU Order").
 * Near Expiry and Filler win (they change what we receive), then Specific MRP, Must Bill, Range, Promo/Freebie, General. */
export function lineKind(typeDesc) {
  const t = String(typeDesc ?? '').toLowerCase()
  if (/near expiry/.test(t)) return 'near_expiry'
  if (/filler/.test(t)) return 'filler'
  if (/specific mrp/.test(t)) return 'specific_mrp'
  if (/must bill/.test(t)) return 'must_bill'
  if (/range/.test(t)) return 'range'
  if (/promo|freebie/.test(t)) return 'promo'
  if (/general/.test(t)) return 'general'
  return 'other'
}
const clean = (x) => { const t = String(x ?? '').trim(); return !t || /^(nan|nat|none|null)$/i.test(t) ? null : t }
/** Lines of the End to End report grouped by order + SKU + kind: what we asked, what Pepsi corrected, allocated, invoiced and deleted, and why. */
export function orderLines(e2e) {
  const m = new Map()
  for (const r of e2e) {
    const order_no = clean(r['Requested Order Number']), sku = clean(r['Sku Code'])
    if (!order_no || !sku) continue
    const kind = lineKind(r['Order Type Description Oms'])
    const k = `${order_no}|${sku}|${kind}`
    const x = m.get(k) ?? { order_no, sku_code: String(sku), kind, order_type: clean(r['Order Type Description Oms']), order_date: day(r['Order Date']), description: clean(r['Sku Description']),
      asked: 0, corrected: 0, allocated: 0, invoiced: 0, deleted: 0, value_paise: 0, delete_reason: null, reject_reason: null }
    x.asked += num(r['Pristine Order Quantity']); x.corrected += num(r['Corrected Order Quantity']); x.allocated += num(r['Allocated Order Quantity'])
    x.invoiced += num(r['Invoiced Quantity Sap']); x.deleted += num(r['Deleted Quantity'])
    x.value_paise += Math.round(num(r['Allocated Order Value'] || r['Corrected Order Value'] || r['Pristine Order Value']) * 100)
    x.delete_reason ??= clean(r['Delete Reason Oms'])
    x.reject_reason ??= clean(r['Rejection Des Sap']) ?? clean(r['Reason Of Rejection Sap'])
    m.set(k, x)
  }
  return [...m.values()]
}

/** Special lines (Near Expiry, Specific MRP, Filler) we have not announced yet: new, or the quantity we get went up. Grouped by order.
 * prev: Map "order|sku|kind" -> quantity we got when last seen. Lines where we get nothing (cut or deleted) are not news. */
export function specialNews(prev, lines) {
  const out = new Map()
  for (const l of lines) {
    if (!['near_expiry', 'specific_mrp', 'filler'].includes(l.kind)) continue
    const got = l.invoiced || l.allocated || 0
    const was = prev.get(`${l.order_no}|${l.sku_code}|${l.kind}`)
    if (!got || (was !== undefined && was >= got)) continue
    const o = out.get(l.order_no) ?? { order_no: l.order_no, items: [] }
    o.items.push({ kind: l.kind, description: l.description, qty: got })
    out.set(l.order_no, o)
  }
  return [...out.values()]
}

const KIND_HI = { near_expiry: 'Near Expiry', specific_mrp: 'Specific MRP', filler: 'Filler', must_bill: 'Must Bill', range: 'Range', promo: 'Promo' }
/** Must Bill list and Range progress for one month ('YYYY-MM'). mustBill: rows of must_bill_dbr_target_report, range: rows of range_target_report (one per day and SKU).
 * Must bill target = the biggest of the quantities Pepsi fills in (user must bill, system must bill, DBR parent target). Range: the latest day's month-to-date billed and open-order cases. */
export function targetRows(mustBill, range, month) {
  const out = []
  for (const r of mustBill) {
    if (String(r['Month Year'] ?? '').slice(0, 7) !== month) continue
    const code = clean(r['Parent SKU Code']); if (!code) continue
    out.push({ kind: 'must_bill', month, parent_sku_code: code, description: clean(r['Parent SKU Descr']) ?? code, brand: clean(r.Brand),
      target_qty: Math.max(num(r['User Must Bill Qty']), num(r['System MB Qty']), num(r['User DBR Parent Target Qty*']), num(r['DBR Parent Target Qty'])),
      done_qty: 0, open_qty: 0, valid_to: day(r['Valid To']) })
  }
  const latest = new Map()
  for (const r of range) {
    const code = clean(r['Parent SKU Code']), d = day(r.report_date ?? r['MTD Date']); if (!code || !d || d.slice(0, 7) !== month) continue
    if (!latest.has(code) || d > latest.get(code).d) latest.set(code, { d, r })
  }
  for (const [code, { r }] of latest) out.push({ kind: 'range', month, parent_sku_code: code, description: clean(r['Parent SKU Desc']) ?? code, brand: clean(r.Brand),
    target_qty: 0, done_qty: num(r['DBR Parent MTD']), open_qty: num(r['DBR Parent MTD OO']), valid_to: null })
  return out
}
/** Must Bill targets that Pepsi has just set or changed (prev: Map "month|parent" -> target_qty as stored). */
export function targetNews(prev, rows) {
  return rows.filter((r) => r.kind === 'must_bill' && r.target_qty > 0 && (prev.get(`${r.month}|${r.parent_sku_code}`) ?? 0) !== r.target_qty)
}

/** Why Pepsi's version of an order differs from ours, in plain words: the reasons Pepsi recorded when it deleted or rejected lines, and the
 * extra cases it added by kind (Near Expiry, Specific MRP, Filler, ...). Returns [] when there is nothing to explain. */
export function orderWhy(lines, orderNo) {
  const mine = lines.filter((l) => l.order_no === orderNo)
  const out = []
  const del = [...new Set(mine.filter((l) => l.delete_reason).map((l) => l.delete_reason))]
  if (del.length) out.push(`Pepsi ne line hatayi, karan: ${del.join(', ')}`)
  const rej = [...new Set(mine.filter((l) => l.reject_reason).map((l) => l.reject_reason))]
  if (rej.length) out.push(`SAP ne reject kiya: ${rej.join(', ')}`)
  const added = {}
  for (const l of mine) {
    const extra = (Number(l.corrected) || 0) - (Number(l.asked) || 0)
    if (extra > 0 && l.kind !== 'general') added[l.kind] = (added[l.kind] ?? 0) + extra
  }
  const parts = Object.entries(added).map(([k, n]) => `${KIND_HI[k] ?? k} +${n}`)
  if (parts.length) out.push(`Pepsi ne jodha: ${parts.join(', ')} peti`)
  const gen = mine.filter((l) => l.kind === 'general')
  const more = gen.reduce((a, l) => a + Math.max(0, (Number(l.corrected) || 0) - (Number(l.asked) || 0)), 0)
  if (more > 0) out.push(`General maal me ${more} peti badhayi (truck bharne ke liye)`)
  return out
}

const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Telegram lines for what changed on Pepsi's side since the last sync. old: Map order_no -> { status, asked, corrected, deleted } as stored last time.
 * Each change is announced once: the same stored state must produce nothing. (13 Nov: a missing `deleted` field in `old` re-sent the cancel line on every sync.) */
export function orderChangeNews(old, ords, olines = []) {
  const out = []
  for (const o of ords) {
    const b = old.get(o.order_no), lines = []
    const was = (k) => Number(b?.[k]) || 0
    if (!b) lines.push(`🆕 Pepsi order <b>${escHtml(o.order_no)}</b> (${o.ordered_on ?? ''}): ${o.asked || o.corrected} peti${o.created_by ? ` · ${escHtml(o.created_by)}` : ''}`)
    else if (o.status && o.status !== b.status) lines.push(`🔄 Pepsi order <b>${escHtml(o.order_no)}</b>: ${escHtml(b.status ?? '?')} → <b>${escHtml(o.status)}</b>`)
    if (o.corrected && o.asked && o.corrected !== o.asked && (!b || was('corrected') !== o.corrected)) lines.push(`✏️ Pepsi ne order ${escHtml(o.order_no)} badla: aapne <b>${o.asked}</b> peti maangi, unhone <b>${o.corrected}</b> kar di`)
    if (o.deleted && was('deleted') !== o.deleted && !o.corrected) lines.push(`🗑 Pepsi order ${escHtml(o.order_no)} cancel/short-close hua (${o.deleted} peti)`)
    if (lines.length) lines.push(...orderWhy(olines, o.order_no).map((w) => `   ↳ ${escHtml(w)}`))
    out.push(...lines)
  }
  return out
}

/** One row per Pepsi order (requested order number) with quantities at each stage and its status. */
export function orderRows(e2e, summary = []) {
  const status = new Map(summary.map((r) => [r['Requested Order Number'], r['Order Status Desc']]))
  const m = new Map()
  for (const r of e2e) {
    const k = r['Requested Order Number']; if (!k) continue
    const o = m.get(k) ?? { order_no: k, ordered_on: day(r['Order Date']), created_by: r['Created By Oms'] || r['Updated By Oms'] || null, status: status.get(k) ?? null,
      asked: 0, corrected: 0, allocated: 0, invoiced: 0, deleted: 0, value_paise: 0, invoiced_paise: 0 }
    o.asked += num(r['Pristine Order Quantity']); o.corrected += num(r['Corrected Order Quantity']); o.allocated += num(r['Allocated Order Quantity'])
    o.invoiced += num(r['Invoiced Quantity Sap']); o.deleted += num(r['Deleted Quantity'])
    o.value_paise += Math.round(num(r['Allocated Order Value'] || r['Corrected Order Value'] || r['Pristine Order Value']) * 100)
    o.invoiced_paise += Math.round(num(r['Invoiced Value Sap']) * 100)
    m.set(k, o)
  }
  for (const r of summary) if (r['Requested Order Number'] && m.has(r['Requested Order Number'])) m.get(r['Requested Order Number']).status = r['Order Status Desc']
  return [...m.values()]
}
/** Pepsi invoices with no matching purchase: same invoice number, or purchases dated -1..+4 days whose cases add up to the invoices of that day. */
export function unbookedInvoices(lines, purchases) {
  const inv = new Map()
  for (const l of lines) { const x = inv.get(l.invoice_no) ?? { invoice_no: l.invoice_no, on: l.invoiced_on, qty: 0, value_paise: 0, lines: 0 }; x.qty += l.qty; x.value_paise += l.value_paise; x.lines++; inv.set(l.invoice_no, x) }
  const byDay = new Map()
  for (const x of inv.values()) byDay.set(x.on, (byDay.get(x.on) ?? 0) + x.qty)
  const near = (a, b) => { const d = (Date.parse(b) - Date.parse(a)) / 864e5; return d >= -1 && d <= 4 }
  return [...inv.values()].filter((x) => {
    if (purchases.some((p) => String(p.invoice_no ?? '').includes(x.invoice_no))) return false
    const close = purchases.filter((p) => x.on && p.purchase_date && near(x.on, p.purchase_date))
    const cases = close.reduce((a, p) => a + num(p.cases), 0)
    return !(close.length && (cases === x.qty || cases === byDay.get(x.on) || close.some((p) => num(p.cases) === x.qty)))
  })
}
