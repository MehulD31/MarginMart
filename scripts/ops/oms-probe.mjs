// One-off, READ-ONLY look at what the Pepsi portal offers beyond what oms-sync uses. Only calls "get-*" / lookup endpoints
// (names taken from the portal's own front-end code). Prints status + a short sample of each; changes nothing, saves nothing.
// Run: ops.yml mode=omsprobe. The login takes over the single portal session for a minute, then logs out.
import { omsLogin, omsSnapshot } from './oms.mjs'

const short = (x, n = 700) => { const t = JSON.stringify(x); return t.length > n ? t.slice(0, n) + `… (${t.length} chars)` : t }

export async function probeOms({ env }) {
  const s = await omsLogin(env('OMS_USER'), env('OMS_PASS'))
  try {
    const snap = await omsSnapshot(s), node = snap.node
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const from = new Date(Date.now() - 30 * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const t = (name, path, body, method) => s.call(path, body, method).then((r) => console.log(`\n### ${name} [${path}] OK\n${short(r)}`)).catch((e) => console.log(`\n### ${name} [${path}] FAIL ${e.message}`))
    console.log('node', node, snap.name, 'user', JSON.stringify(s.user ?? {}).slice(0, 300))
    // second pass: the endpoints that refused POST are GET (like get-portal-order-history)
    for (const p of ['report_server_filters/report-lookup', 'report_server_filters/one-click-report-lookup', 'report_server_filters/report-trigger-mapping', 'report_server_filters/report-status', 'ocp_os/get-orders-summary', 'ocp_os/get-order-correction-data', 'ocp_ao/get-allocated-order', 'ocp_po/get-purchase-order-summary', 'ocp_op/get-suggested-orders'])
      await t('GET ' + p, p, null, 'GET')
    await t('stock at source (node)', 'ocp/get-stock-at-source', { sender_node_code: '1042', receiver_node_code: node })
    await t('sku schemes (all)', 'ocp/get-sku-schemes', { receiver_node_code: node, tool: 'OMS' })
    console.log('\nprice rows', snap.prices.length, 'schemes', snap.schemes.length, 'vehicles', snap.vehicles.length, 'orders', snap.orders.length, 'pdp', short(snap.pdp, 200))
  } finally { await s.logout() }
}
