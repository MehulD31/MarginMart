// One-off, READ-ONLY look at the Pepsi portal. Prints our own data only; changes nothing, saves nothing.
// Run: ops.yml mode=omsprobe. The login takes over the single portal session for a minute, then logs out.
import { omsLogin, omsSnapshot } from './oms.mjs'

const short = (x, n = 600) => { const t = typeof x === 'string' ? x : JSON.stringify(x); return t.length > n ? t.slice(0, n) + `… (${t.length} chars)` : t }

export async function probeOms({ env }) {
  const s = await omsLogin(env('OMS_USER'), env('OMS_PASS'))
  try {
    const snap = await omsSnapshot(s)
    console.log('node', snap.node)
    const sk = snap.skus.find((x) => /MIRINDA/.test(x.sku_description)) ?? snap.skus[0]
    console.log('SKU MASTER KEYS', Object.keys(sk ?? {}).join(' | '))
    console.log('SKU SAMPLE', short(sk, 1500))
    const wkeys = new Set()
    for (const x of snap.skus) for (const k of Object.keys(x)) if (/weight|wt|kg|gross|net/i.test(k)) wkeys.add(k)
    console.log('WEIGHT-LIKE KEYS', [...wkeys].join(', ') || '(none)')
    const withW = snap.skus.filter((x) => Number(x.gross_weight ?? x.weight ?? x.gross_wt ?? 0) > 0).length
    console.log('SKUs with a weight', withW, 'of', snap.skus.length)
    const ao = await s.call('ocp_ao/get-allocated-order', null, 'GET').catch((e) => ({ error: e.message }))
    const rows = ao.allocated_order ?? []
    console.log('ALLOCATED rows', rows.length)
    for (const r of rows.slice(0, 20)) console.log('AO', r.sku_code, '|', r.sku_description, '| final', r.final_order, '| gross_weight', r.gross_weight, '| h6', r.h6, '| h10', r.h10)
  } finally { await s.logout() }
}
