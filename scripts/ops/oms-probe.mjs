// One-off, READ-ONLY look at what the Pepsi portal offers beyond what oms-sync uses. Only calls "get-*" / lookup / report-data
// endpoints (names taken from the portal's own front-end code). Prints columns + a few sample rows; changes nothing, saves nothing.
// Run: ops.yml mode=omsprobe. The login takes over the single portal session for a minute, then logs out.
import { omsLogin, omsSnapshot } from './oms.mjs'

const short = (x, n = 600) => { const t = typeof x === 'string' ? x : JSON.stringify(x); return t.length > n ? t.slice(0, n) + `… (${t.length} chars)` : t }

export async function probeOms({ env }) {
  const s = await omsLogin(env('OMS_USER'), env('OMS_PASS'))
  try {
    const snap = await omsSnapshot(s), node = snap.node
    const day = (ms) => new Date(Date.now() - ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const to = day(0), from = day(60 * 864e5)
    console.log('node', node, snap.name)

    // 1. every report: total rows, columns, 3 sample rows (last 60 days)
    const list = (await s.call('report_server_filters/report-lookup', null, 'GET').catch(() => null))?.data ?? []
    for (const r of list) {
      try {
        const res = await s.call(`report_server_filters/report-data/${r.report_id}`, { sort_by: '', records_per_page: '5', page_number: '1', from_date: from, to_date: to })
        const rows = res.data ?? []
        console.log(`\n### REPORT ${r.report_id} (${r.name}) total=${res.total ?? '?'} rows_returned=${rows.length}`)
        if (rows[0]) console.log('COLUMNS', Object.keys(rows[0]).join(' | '))
        for (const row of rows.slice(0, 3)) console.log('ROW', short(row, 900))
        if (!rows.length) console.log('RESPONSE', short(res, 400))
      } catch (e) { console.log(`\n### REPORT ${r.report_id} FAIL ${e.message}`) }
    }
    // the filters each report accepts
    for (const id of ['must_bill_target_report', 'range_target_report', 'pdp_adherence_report', 'crs_report', 'price_deviation_report_v2'])
      await s.call('report_server_filters/report-filter', { report_id: id }).then((r) => console.log(`\n### FILTERS ${id}\n${short(r, 700)}`)).catch((e) => console.log(`\n### FILTERS ${id} FAIL ${e.message}`))

    // 2. the portal's own rules (masters data): filler trucks, thresholds, order types
    const md = await s.call('ocp/get-masters-data', { receiver_node_code: node }).catch(() => null)
    if (md?.global_params) for (const [k, v] of Object.entries(md.global_params)) console.log('PARAM', k, '=', short(v, 160))
    console.log('MASTER KEYS', Object.keys(md ?? {}).join(', '))

    // 3. what Pepsi allocated for our orders (filler lines, truck, SAP order)
    const ao = await s.call('ocp_ao/get-allocated-order', null, 'GET').catch((e) => ({ error: e.message }))
    const rows = ao.allocated_order ?? []
    console.log('\n### ALLOCATED ORDER rows', rows.length, rows[0] ? 'COLUMNS ' + Object.keys(rows[0]).join(' | ') : short(ao))
    const by = {}
    for (const r of rows) { const k = `${r.requested_order_number} ${r.order_number} filler=${r.is_filler} type=${r.order_type}`; by[k] = (by[k] ?? 0) + (r.final_order ?? 0) }
    for (const [k, v] of Object.entries(by)) console.log('ALLOC', k, 'cases', v)
    console.log('pristine vs final per order:')
    const po = {}
    for (const r of rows) { const p = (po[r.requested_order_number] ??= { pristine: 0, final: 0, filler: 0 }); p.pristine += r.pristine_order ?? 0; p.final += r.final_order ?? 0; if (r.is_filler) p.filler += r.final_order ?? 0 }
    console.log(JSON.stringify(po))
    console.log('sample', short(rows.find((r) => r.is_filler) ?? rows[0] ?? {}, 900))

    // 4. the portal's own order history record
    console.log('\n### PORTAL ORDER HISTORY', short(snap.orders, 1500))
    console.log('vehicle', short(snap.vehicles, 900))
    console.log('price rows', snap.prices.length, 'schemes', snap.schemes.length, 'pdp', short(snap.pdp, 200))
  } finally { await s.logout() }
}
