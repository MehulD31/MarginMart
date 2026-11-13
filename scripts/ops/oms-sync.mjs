// Pepsi portal -> MarginMart sync (owner, 13 Nov 2026). READ-ONLY on the portal. Runs as MODE=oms and at the start of the
// morning report. Writes oms_sku / oms_price_change / oms_map / oms_state, then tells Telegram what changed:
// price changes on items we stock, a new order / invoice on the portal, and a failure (never silent).
import { omsLogin, omsSnapshot, omsItems, matchSku, priceChanges, orderEvents } from './oms.mjs'
import { item } from './format.mjs'

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const rs = (p) => '₹' + Math.round(Number(p ?? 0) / 100).toLocaleString('en-IN')

export async function syncOms({ db, say, env }) {
  const user = env('OMS_USER', false), pass = env('OMS_PASS', false)
  if (!user || !pass) { console.log('OMS_USER/OMS_PASS not set; skipping portal sync'); return null }
  const [state] = await db('oms_state?id=eq.1&select=*')
  let s
  try {
    s = await omsLogin(user, pass)
    const snap = await omsSnapshot(s)
    const items = omsItems(snap)

    // 1. SKUs + price history
    const prevRows = await db('oms_sku?select=sku_code,price_paise')
    const prev = new Map(prevRows.map((r) => [r.sku_code, r.price_paise]))
    const changes = priceChanges(prev, items)
    const now = new Date().toISOString()
    await db('oms_sku?on_conflict=sku_code', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(items.map((i) => ({ sku_code: i.sku_code, description: i.description, child: i.child, mrp_paise: i.mrp ? Math.round(i.mrp * 100) : null,
        units_per_case: i.units_per_case, price_paise: i.price_paise, base_paise: i.base_paise, tax_paise: i.tax_paise, updated_at: now }))) })
    if (changes.length) await db('oms_price_change', { method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(changes.map((c) => ({ sku_code: c.sku_code, old_paise: c.old, new_paise: c.now }))) })

    // 2. our flavour -> portal SKU (auto rows only; a manual choice is never overwritten)
    const ours = await db('variant?select=id,flavour_en,active,pack:pack_id(name_en,mrp_paise,active)&active=eq.true')
    const manual = new Set((await db('oms_map?source=eq.manual&select=variant_id')).map((m) => m.variant_id))
    const maps = []
    for (const v of ours) {
      if (!v.pack?.active || v.pack.name_en.startsWith('QA ') || manual.has(v.id)) continue
      const label = v.flavour_en === v.pack.name_en ? v.pack.name_en : `${v.flavour_en} ${v.pack.name_en}`
      const mrp = v.pack.mrp_paise ? v.pack.mrp_paise / 100 : null
      const m = matchSku(label, mrp, items)
      if (m) maps.push({ variant_id: v.id, sku_code: m.sku_code, source: 'auto', mrp_differs: !!(m.mrp && mrp && Math.round(m.mrp) !== Math.round(mrp)), updated_at: now })
    }
    await db('oms_map?source=eq.auto', { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    if (maps.length) await db('oms_map?on_conflict=variant_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(maps) })

    // 3. state (credit, delivery days, schemes, orders)
    const events = state?.orders ? orderEvents(state.orders, snap.orders) : []   // first sync: no "new order" spam
    const credit = snap.credit?.available_credit != null ? Math.round(Number(snap.credit.available_credit) * 100) : null
    await db('oms_state?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      synced_at: now, ok: true, error: null, distributor_code: snap.node, distributor_name: snap.name, credit_paise: credit,
      credit_at: snap.credit?.status_timestamp ? new Date(snap.credit.status_timestamp.replace(' ', 'T') + '+05:30').toISOString() : now,
      pdp: snap.pdp, schemes: snap.schemes, orders: snap.orders, vehicles: snap.vehicles }) })

    // 4. Telegram: only what matters, only when it changes
    const mapped = new Map(maps.map((m) => [m.sku_code, m.variant_id]))
    const ourChanges = changes.filter((c) => mapped.has(c.sku_code))
    if (ourChanges.length) {
      await say(['💲 <b>Pepsi ne rate badla</b> (portal, aaj)', ...ourChanges.map((c) =>
        `▸ ${esc(item(c.description))}: ${rs(c.old)} → <b>${rs(c.now)}</b> (${c.now > c.old ? '+' : ''}${rs(c.now - c.old)}/peti)`),
      '<i>Apna selling rate check karo: Pricing &amp; margin.</i>'].join('\n'), { parse_mode: 'HTML' })
    }
    for (const e of events) {
      const what = e.kind === 'new' ? '🆕 Portal pe naya Pepsi order' : e.kind === 'invoiced' ? '🧾 Pepsi ne invoice bana diya' : '🔄 Pepsi order status badla'
      await say([`${what}: <b>${esc(e.key)}</b>`, e.status ? `Status: ${esc(e.status)}${e.from ? ` (pehle ${esc(e.from)})` : ''}` : '',
        e.value ? `Value: ${rs(e.value * 100)}` : '', e.qty ? `Qty: ${e.qty} peti` : '', e.invoice ? `Invoice: ${esc(e.invoice)}` : '',
        e.kind === 'invoiced' ? '→ Maal aate hi Purchases me ye invoice entry karo.' : ''].filter(Boolean).join('\n'), { parse_mode: 'HTML' })
    }
    console.log(`oms sync ok: ${items.length} skus, ${maps.length} mapped, ${changes.length} price changes, ${events.length} order events, credit ${credit}`)
    return { items, maps, changes, events, credit, node: snap.node }
  } catch (e) {
    await db('oms_state?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ok: false, error: String(e.message).slice(0, 300) }) }).catch(() => {})
    // alert on the first failure only; the watchdog keeps reminding if the data goes stale (> 26 h)
    if (state?.ok !== false) await say(`⚠️ Pepsi portal sync fail: ${String(e.message).slice(0, 200)}\n(Password badla ho to GitHub secret OMS_PASS update karo.)`).catch(() => {})
    throw e
  } finally {
    if (s) await s.logout()   // never leave the single portal session open
  }
}
