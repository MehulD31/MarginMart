// One-off, READ-ONLY look at what the Pepsi portal offers beyond what oms-sync uses. Only calls "get-*" / lookup / report-data
// endpoints (names taken from the portal's own front-end code). Prints our own rows only; changes nothing, saves nothing.
// Run: ops.yml mode=omsprobe. The login takes over the single portal session for a minute, then logs out.
import { omsLogin } from './oms.mjs'

const short = (x, n = 600) => { const t = typeof x === 'string' ? x : JSON.stringify(x); return t.length > n ? t.slice(0, n) + `… (${t.length} chars)` : t }
const live = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== '' && v !== 0 && v !== '0' && v !== 'nan' && v !== 'NaT'))

export async function probeOms({ env }) {
  const s = await omsLogin(env('OMS_USER'), env('OMS_PASS'))
  try {
    const node = '198626'
    const day = (ms) => new Date(Date.now() - ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const to = day(0), from = day(60 * 864e5)
    console.log('node', node)
    const md = await s.call('ocp/get-masters-data', { receiver_node_code: node }).catch(() => ({}))
    for (const k of ['order_type_masters', 'order_status_masters', 'action_reason_masters', 'sales_channel_master', 'order_with_storage_location'])
      console.log('\nMASTER', k, short(md[k], 2500))
    const all = async (id, extra = {}) => {
      const rows = []
      for (let page = 1; page <= 10; page++) {
        const r = await s.call(`report_server_filters/report-data/${id}`, { sort_by: '', records_per_page: '500', page_number: String(page), from_date: from, to_date: to, ...extra })
        rows.push(...(r.data ?? []))
        if (!r.data?.length || rows.length >= Number(r.total ?? 0)) break
      }
      return rows
    }
    const ours = (rows) => rows.filter((r) => [r['Ship To'], r['Ship to Party Code'], r.ship_to_code, r['Ship-To Party Code'], r['Ship To Party']].some((v) => String(v) === node))
    for (const id of ['must_bill_dbr_target_report', 'range_target_report', 'pdp_adherence_report', 'tt_end_to_end_summary_report']) {
      const rows = ours(await all(id).catch((e) => { console.log('FAIL', id, e.message); return [] }))
      console.log(`\n### ${id}: ${rows.length} of our rows`)
      if (rows[0]) console.log('ALL COLUMNS', Object.keys(rows[0]).join(' | '))
      for (const r of rows.slice(0, 40)) console.log('ROW', short(live(r), 1100))
    }
    const e2e = await all('end_to_end_report', { ship_to_party: '', sales_office: '', sku_description: '', created_by_oms: '' })
    const seen = new Set()
    console.log('\n### end_to_end: delete reasons and order types per order')
    for (const r of e2e) {
      const k = `${r['Requested Order Number']}|${r['Delete Reason Oms']}|${r['Order Type Description Oms']}`
      if (seen.has(k)) continue
      seen.add(k)
      console.log('E2E', r['Requested Order Number'], '| type', r['Order Type Description Oms'], '| deleted:', r['Delete Reason Oms'], r['Deleted At Oms'], '| by', r['Created By Oms'])
    }
    console.log('e2e columns', Object.keys(e2e[0] ?? {}).slice(30).join(' | '))
  } finally { await s.logout() }
}
