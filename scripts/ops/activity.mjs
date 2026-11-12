// "What happened on the website" -> Telegram (owner, 12 Nov 2026). Pure formatting; ops.mjs fetches audit_log and names.
// One group = everything one person saved in one go (same actor + same transaction time in audit_log).
// Output is Telegram HTML (parse_mode HTML): names and notes are escaped, key facts are bold.
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const rs = (p) => '<b>₹' + Math.round(Number(p ?? 0) / 100).toLocaleString('en-IN') + '</b>'
const cnt = (rows, table, action) => rows.filter((r) => r.table_name === table && (!action || r.action === action))
const NICE = { shop: 'dukaan', pack: 'item', variant: 'item flavour', price_list: 'rate list', price_list_item: 'rate', scheme: 'scheme', settings: 'settings',
  business_settings: 'business settings', vehicle: 'gaadi', route: 'route', profiles: 'login', supplier: 'supplier', join_requests: 'join request', stock: 'stock' }

/** Lines for one group. L = { variant(id), route(id), vehicle(id), shop(id), supplier(id), load(planId) -> [{variant_id, qty}] } */
export function describe(g, L0) {
  const E = (f) => (id) => { const v = f(id); return v == null ? v : esc(v) }
  const L = { ...L0, variant: E(L0.variant), route: E(L0.route), vehicle: E(L0.vehicle), shop: E(L0.shop), supplier: E(L0.supplier) }
  const out = [], rows = g.rows, used = new Set()
  const take = (list) => { list.forEach((r) => used.add(r)); return list }
  // trips: load / leave / back / close
  for (const r of take(cnt(rows, 'route_day_plan', 'update'))) {
    const a = r.after ?? {}, b = r.before ?? {}
    const trip = `<b>${L.vehicle(a.vehicle_id) ?? 'Gaadi'}</b>${L.route(a.route_id) ? ' · ' + L.route(a.route_id) : ''}`
    if (!b.unloaded_at && a.unloaded_at) {
      // evening unload (status also moves loaded -> out in the same save): what came back, what was sold
      const lines = cnt(rows, 'load_line', 'update').map((x) => ({ v: x.after?.variant_id, back: Number(x.after?.qty_returned ?? 0), out: Number(x.after?.qty_ordered_total ?? 0) + Number(x.after?.qty_spare ?? 0) }))
      const all = L.load(r.row_id) ?? []
      const went = all.reduce((s, x) => s + x.qty, 0) || lines.reduce((s, x) => s + x.out, 0)
      const back = lines.reduce((s, x) => s + x.back, 0)
      const top = lines.filter((x) => x.back > 0).sort((x, y) => y.back - x.back).slice(0, 15).map((x) => `   • ${L.variant(x.v) ?? '?'} — <b>${x.back}</b>`)
      out.push(`↩️ <b>Truck wapas (unload)</b>: ${trip}\n   Gaya <b>${went}</b> · wapas godown <b>${back}</b> · bika (parchi baaki) <b>${Math.max(0, went - back)}</b>${top.length ? `\n${top.join('\n')}` : ''}`)
    } else if (b.status === 'planning' && a.status === 'loaded') {
      const lines = L.load(r.row_id) ?? []
      const total = lines.reduce((s, x) => s + x.qty, 0)
      const top = [...lines].sort((x, y) => y.qty - x.qty).slice(0, 15).map((x) => `   • ${L.variant(x.variant_id) ?? '?'} — <b>${x.qty}</b>`)
      out.push(`🚚 <b>Truck load</b>: ${trip}\n   <b>${total} peti</b> · ${lines.length} item${top.length ? `\n${top.join('\n')}${lines.length > 15 ? `\n   … +${lines.length - 15} aur` : ''}` : ''}`)
    } else if (b.status === 'loaded' && a.status === 'out') out.push(`🛣 ${trip} nikal gayi`)
    else if (a.status === 'closed' && b.status !== 'closed') out.push(`✅ ${trip} ka hisaab close${a.short_cases ? ` · ${a.short_cases} peti kam` : ''}${a.close_note ? ` · "${esc(String(a.close_note).slice(0, 60))}"` : ''}`)
    else if (a.status === 'planning' && b.status && b.status !== 'planning') out.push(`↶ ${trip}: load wapas khola (${b.status} → planning)`)
    else if (a.vehicle_id !== b.vehicle_id) out.push(`🔁 ${L.route(a.route_id) ?? 'trip'}: gaadi badli → ${L.vehicle(a.vehicle_id) ?? '-'}`)
    else used.delete(r)
  }
  take(cnt(rows, 'load_line')); take(cnt(rows, 'route_day_plan', 'insert'))
  // counter / truck bills
  // a bill/purchase is inserted with total 0 and its total is filled in by an update in the same save: use the final row
  const final = (r) => [...cnt(rows, r.table_name, 'update')].reverse().find((u) => u.row_id === r.row_id)?.after ?? r.after
  const bills = take(cnt(rows, 'cash_sale', 'insert')).map((r) => ({ ...r, after: final(r) }))
  for (const r of bills.slice(0, 6)) out.push(`🧾 Bill <b>${esc(r.after?.number)}</b> · ${L.shop(r.after?.shop_id) ?? 'counter'} · ${rs(r.after?.total_paise)} (${r.after?.payment_mode ?? ''})`)
  if (bills.length > 6) out.push(`🧾 +${bills.length - 6} aur bill`)
  for (const r of take(cnt(rows, 'cash_sale', 'update'))) {
    if (!r.before?.voided_at && r.after?.voided_at) out.push(`🚫 Bill ${r.after?.number ?? ''} cancel kiya (${rs(r.after?.total_paise)})${r.after?.void_reason ? `: ${esc(String(r.after.void_reason).slice(0, 60))}` : ''}`)
  }
  take(cnt(rows, 'cash_sale_line'))
  const inv = take(cnt(rows, 'invoice', 'insert'))
  if (inv.length) out.push(`🧾 ${inv.length} delivery bill · ${rs(inv.reduce((s, r) => s + Number(r.after?.total_paise ?? 0), 0))}${inv.length <= 3 ? ` (${inv.map((r) => L.shop(r.after?.shop_id) ?? '?').join(', ')})` : ''}`)
  for (const r of take(cnt(rows, 'purchase', 'insert')).map((x) => ({ ...x, after: final(x) }))) out.push(`📦 Purchase · ${L.supplier(r.after?.supplier_id) ?? 'supplier'}${r.after?.invoice_no ? ` #${esc(r.after.invoice_no)}` : ''} · ${rs(r.after?.total_paise)}`)
  take(cnt(rows, 'purchase_line')); take(cnt(rows, 'purchase', 'update'))
  const ord = take(cnt(rows, 'orders', 'insert')).filter((r) => r.after?.source !== 'shop')    // shop orders are alerted separately
  if (ord.length) out.push(`📝 ${ord.length} order likha${ord.length <= 3 ? ` (${ord.map((r) => L.shop(r.after?.shop_id) ?? '?').join(', ')})` : ''}`)
  for (const r of take(cnt(rows, 'orders', 'update'))) if (r.after?.status === 'cancelled' && r.before?.status !== 'cancelled') out.push(`✖️ Order cancel · ${L.shop(r.after?.shop_id) ?? '?'}`)
  for (const r of take(cnt(rows, 'cash_handover'))) {
    if (r.after?.received_at && !r.before?.received_at) out.push(`💵 Cash liya: ${rs(r.after.received_paise)}`)
    else if (r.action === 'insert') out.push(`💵 Driver ne cash jama kiya: ${rs(r.after?.handed_cash_paise)} (hona tha ${rs(r.after?.expected_cash_paise)})`)
  }
  for (const r of take(cnt(rows, 'shop', 'insert'))) out.push(`🏪 Nayi dukaan: <b>${esc(r.after?.name)}</b>${r.after?.locality ? ' · ' + esc(r.after.locality) : ''}`)
  // manual stock changes (not part of a bill/load/purchase)
  const moves = take(cnt(rows, 'stock_move', 'insert'))
  const manual = moves.filter((r) => !r.after?.cash_sale_id && !r.after?.route_day_plan_id && !r.after?.purchase_id)
  for (const r of manual.slice(0, 6)) out.push(`📊 Stock <b>${Number(r.after?.qty) > 0 ? '+' : ''}${r.after?.qty}</b> · ${L.variant(r.after?.variant_id) ?? '?'}${r.after?.reason ? ` · "${esc(String(r.after.reason).slice(0, 50))}"` : ''}`)
  take(cnt(rows, 'stock'))
  // deletes always show
  const dels = rows.filter((r) => r.action === 'delete' && !used.has(r))
  const byT = {}; for (const r of dels) { byT[r.table_name] = (byT[r.table_name] ?? 0) + 1; used.add(r) }
  for (const [t, k] of Object.entries(byT)) out.push(`🗑 ${NICE[t] ?? t}: ${k} delete`)
  // anything else: settings, prices, catalogue, logins...
  const rest = {}; for (const r of rows) if (!used.has(r)) rest[r.table_name] = (rest[r.table_name] ?? 0) + 1
  for (const [t, k] of Object.entries(rest)) out.push(`✏️ ${NICE[t] ?? t}: ${k} badlav`)
  return out
}

/** Group audit rows (sorted by id) into "one save" chunks. */
export function groupRows(rows) {
  const groups = []
  for (const r of rows) {
    const g = groups.at(-1)
    if (g && g.actor === r.actor && g.at === r.at) g.rows.push(r)
    else groups.push({ actor: r.actor, at: r.at, rows: [r] })
  }
  return groups
}

// One group only (owner, 12 Nov 2026): send right away only what needs attention; everything else is collected
// and sent as one summary every 2 hours. Trips (load / back / close) go right away as one short line, with the
// item list kept for the summary.
const NOW = /^(🚫|🗑|📊|↶|🏪)/
const TRIP = /^(🚚|↩️|🛣|✅|🔁)/
export function split(lines) {
  const now = [], later = []
  for (const l of lines) {
    if (NOW.test(l)) now.push(l)
    else if (TRIP.test(l)) { now.push(l.split('\n').slice(0, 2).join('\n')); if (l.includes('\n')) later.push(l) }
    else later.push(l)
  }
  return { now, later }
}
/** 2-hour summary windows in IST: 08-10, 10-12, ... A window is sent once it has ended. */
export function windowOf(iso) {
  const t = new Date(Date.parse(iso) + 330 * 60e3)
  const h = t.getUTCHours() - (t.getUTCHours() % 2)
  return `${t.toISOString().slice(0, 10)} ${String(h).padStart(2, '0')}`
}
