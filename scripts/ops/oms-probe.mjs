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
    await t('suggested orders (Pepsi\'s own suggestion)', 'ocp_op/get-suggested-orders', { receiver_node_code: node, ship_to: node })
    await t('stock at Pepsi plant', 'ocp/get-stock-at-source', { receiver_node_code: node, node_code: node })
    await t('next PDP date', 'ocp/get-next-pdp-date', { receiver_node_code: node, status_date: today })
    await t('draft order', 'ocp_op/get-draft-order', { receiver_node_code: node, ship_to: node })
    await t('credit master', 'ocp/get-credit-master', { node_code: node })
    await t('must-bill MTD', 'ocp_kpi/get-must-bill-mtd', { receiver_node_code: node, node_code: node })
    await t('must-bill instances', 'ocp_kpi/get-must-bill-instances', { receiver_node_code: node, node_code: node })
    await t('orders summary', 'ocp_os/get-orders-summary', { receiver_node_code: node, from_date: from, to_date: today })
    await t('order correction data', 'ocp_os/get-order-correction-data', { receiver_node_code: node, from_date: from, to_date: today })
    await t('allocated order', 'ocp_ao/get-allocated-order', { receiver_node_code: node, from_date: from, to_date: today })
    await t('purchase order summary', 'ocp_po/get-purchase-order-summary', { receiver_node_code: node, from_date: from, to_date: today })
    await t('masters data', 'ocp/get-masters-data', { receiver_node_code: node })
    await t('sender hierarchy', 'ocp/get-sender-hierarchy', { receiver_node_code: node })
    await t('load plan', 'oms/load-plan', { receiver_node_code: node })
    // which reports the portal can produce (we use end_to_end_report and order_summary_report)
    for (const p of ['report_server_filters/report-lookup', 'report_server_filters/one-click-report-lookup', 'report_server_filters/report-trigger-mapping', 'report_server_filters/report-status'])
      await t('reports', p, { tool: 'OMS' })
    console.log('\nprice rows', snap.prices.length, 'schemes', snap.schemes.length, 'vehicles', snap.vehicles.length, 'orders', snap.orders.length, 'pdp', short(snap.pdp, 200))
  } finally { await s.logout() }
}
