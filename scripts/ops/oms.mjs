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
    units_per_case: Number(s.factor_Case_BT) || null, brand: s.h6 ?? null, flavour: s.h8 ?? null, size: s.h9 ?? null, pack: s.h10 ?? null,
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
