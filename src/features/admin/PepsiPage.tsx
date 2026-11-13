import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../shared/api/supabase'
import { must, usePacks, useStock, useVariants } from '../../shared/api/db'
import { formatPaise } from '../../shared/money'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, PageHeader, Skeleton, type Msg } from '../../shared/ui/kit'

// Pepsi (Varun Beverages) distributor portal, synced every morning by the autopilot (owner, 13 Nov 2026). Admin only.
interface Sku { sku_code: string; description: string; mrp_paise: number | null; price_paise: number | null; base_paise: number | null; tax_paise: number | null; updated_at: string }
interface Map_ { variant_id: string; sku_code: string; source: 'auto' | 'manual'; mrp_differs: boolean }
interface Change { id: number; sku_code: string; old_paise: number; new_paise: number; seen_at: string }
interface State { synced_at: string | null; ok: boolean | null; error: string | null; distributor_code: string | null; distributor_name: string | null
  credit_paise: number | null; credit_at: string | null; orders: Record<string, unknown>[] | null; schemes: unknown[] | null; unbooked: Unbooked[] | null }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—')

export default function PepsiPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const state = useQuery({ queryKey: ['oms_state'], queryFn: () => must<State>(supabase.from('oms_state').select('*').eq('id', 1).single()) })
  const skus = useQuery({ queryKey: ['oms_sku'], queryFn: () => must<Sku[]>(supabase.from('oms_sku').select('*').order('description')) })
  const maps = useQuery({ queryKey: ['oms_map'], queryFn: () => must<Map_[]>(supabase.from('oms_map').select('*')) })
  const changes = useQuery({ queryKey: ['oms_change'], queryFn: () => must<Change[]>(supabase.from('oms_price_change').select('*').order('seen_at', { ascending: false }).limit(20)) })
  const packs = usePacks(), variants = useVariants(), stock = useStock()
  const [msg, setMsg] = useState<Msg>(null)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [openedAt] = useState(() => Date.now())

  const rows = useMemo(() => {
    if (!variants.data || !packs.data || !maps.data || !skus.data || !stock.data) return []
    const pk = new Map(packs.data.map((p) => [p.id, p])), sk = new Map(skus.data.map((s) => [s.sku_code, s]))
    const mp = new Map(maps.data.map((m) => [m.variant_id, m])), st = new Map(stock.data.map((s) => [s.variant_id, s]))
    return variants.data.filter((v) => v.active && pk.get(v.pack_id)?.active && !pk.get(v.pack_id)!.name_en.startsWith('QA ')).map((v) => {
      const p = pk.get(v.pack_id)!, m = mp.get(v.id), s = m ? sk.get(m.sku_code) : undefined, cost = st.get(v.id)?.avg_cost_paise ?? 0
      const label = v.flavour_en === p.name_en ? p.name_en : `${v.flavour_en} ${p.name_en}`
      return { id: v.id, label, mrp: p.mrp_paise, onHand: st.get(v.id)?.on_hand ?? 0, map: m, sku: s, cost, diff: s?.price_paise && cost ? s.price_paise - cost : null }
    }).sort((a, b) => Number(!!a.sku) - Number(!!b.sku) || Number(b.map?.mrp_differs ?? 0) - Number(a.map?.mrp_differs ?? 0) || a.label.localeCompare(b.label))
  }, [variants.data, packs.data, maps.data, skus.data, stock.data])

  if (!state.data || !skus.data || !maps.data) return <Skeleton rows={6} />
  const s = state.data
  const stale = !s.synced_at || openedAt - Date.parse(s.synced_at) > 26 * 3600e3
  const unmatched = rows.filter((r) => !r.sku).length, check = rows.filter((r) => r.map?.mrp_differs).length
  const shown = onlyIssues ? rows.filter((r) => !r.sku || r.map?.mrp_differs || (r.diff != null && r.diff !== 0)) : rows
  const priced = skus.data.filter((x) => x.price_paise)

  const setMap = async (variantId: string, sku: string) => {
    setMsg(null)
    try {
      if (sku) await must(supabase.from('oms_map').upsert({ variant_id: variantId, sku_code: sku, source: 'manual', mrp_differs: false, updated_at: new Date().toISOString() }).select('variant_id'))
      else await must(supabase.from('oms_map').delete().eq('variant_id', variantId).select('variant_id'))
      void qc.invalidateQueries({ queryKey: ['oms_map'] })
      setMsg({ kind: 'success', text: t('pepsi.saved') })
    } catch (e) { setMsg({ kind: 'error', text: errorMessage(t, e) }) }
  }

  return (
    <section className="stack-lg">
      <PageHeader title={t('pepsi.title')} sub={t('pepsi.sub')} />
      {(stale || s.ok === false) && <Alert msg={{ kind: 'warn', text: s.ok === false ? t('pepsi.failed', { e: s.error ?? '' }) : t('pepsi.stale', { at: when(s.synced_at) }) }} />}
      <div className="stats">
        <div className="stat"><div className="label">{t('pepsi.credit')}</div><div className="value num">{s.credit_paise != null ? formatPaise(s.credit_paise) : '—'}</div><div className="cell-sub">{t('pepsi.asOf', { at: when(s.credit_at) })}</div></div>
        <div className="stat"><div className="label">{t('pepsi.synced')}</div><div className="value" style={{ fontSize: 18 }}>{when(s.synced_at)}</div><div className="cell-sub">{s.distributor_name} · {s.distributor_code}</div></div>
        <div className="stat"><div className="label">{t('pepsi.items')}</div><div className="value num">{priced.length}</div><div className="cell-sub">{t('pepsi.itemsSub', { n: skus.data.length })}</div></div>
        <div className="stat"><div className="label">{t('pepsi.matched')}</div><div className="value num">{rows.length - unmatched}/{rows.length}</div><div className="cell-sub">{t('pepsi.matchedSub', { c: check, u: unmatched })}</div></div>
      </div>

      {!!changes.data?.length && (
        <div className="card stack" style={{ gap: 6 }}>
          <b>{t('pepsi.changes')}</b>
          {changes.data.map((c) => { const d = skus.data.find((x) => x.sku_code === c.sku_code)
            return <div key={c.id} className="row-between cell-sub"><span>{d?.description ?? c.sku_code}</span>
              <span className="num">{formatPaise(c.old_paise)} → <b style={{ color: c.new_paise > c.old_paise ? '#dc2626' : '#16a34a' }}>{formatPaise(c.new_paise)}</b> · {when(c.seen_at)}</span></div> })}
        </div>)}

      <Alert msg={msg} />
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <b>{t('pepsi.compare')}</b>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />{t('pepsi.onlyIssues')}</label>
      </div>
      <div className="table-wrap table-scroll"><table className="dense" data-testid="pepsi-table">
        <thead><tr><th scope="col">{t('pepsi.ours')}</th><th scope="col">{t('pepsi.theirs')}</th><th scope="col">{t('pepsi.price')}</th><th scope="col">{t('pepsi.cost')}</th><th scope="col">{t('pepsi.diff')}</th></tr></thead>
        <tbody>{shown.map((r) => (
          <tr key={r.id}>
            <th scope="row">{r.label}<div className="cell-sub">MRP {r.mrp ? formatPaise(r.mrp) : '—'} · {t('pepsi.stock', { n: r.onHand })}</div></th>
            <td>
              <select className="input" style={{ minWidth: 220 }} value={r.map?.sku_code ?? ''} onChange={(e) => void setMap(r.id, e.target.value)} aria-label={t('pepsi.pick', { item: r.label })}>
                <option value="">{t('pepsi.none')}</option>
                {priced.map((x) => <option key={x.sku_code} value={x.sku_code}>{x.description}{x.mrp_paise ? ` · MRP ${x.mrp_paise / 100}` : ''}</option>)}
              </select>
              <div className="cell-sub">{!r.sku ? <span className="badge badge-amber">{t('pepsi.unmatched')}</span>
                : r.map?.mrp_differs ? <span className="badge badge-amber">{t('pepsi.mrpDiffers', { m: r.sku.mrp_paise ? formatPaise(r.sku.mrp_paise) : '—' })}</span>
                : r.map?.source === 'manual' ? t('pepsi.manual') : t('pepsi.auto')}</div>
            </td>
            <td className="num">{r.sku?.price_paise ? formatPaise(r.sku.price_paise) : '—'}{r.sku?.tax_paise ? <div className="cell-sub">{t('pepsi.gst', { v: formatPaise(r.sku.tax_paise) })}</div> : null}</td>
            <td className="num">{r.cost ? formatPaise(r.cost) : '—'}</td>
            <td className="num">{r.diff == null ? '—' : r.diff === 0 ? '✓' : <b style={{ color: r.diff > 0 ? '#dc2626' : '#16a34a' }}>{r.diff > 0 ? '+' : ''}{formatPaise(r.diff)}</b>}</td>
          </tr>))}</tbody>
      </table></div>
      <p className="muted">{t('pepsi.how')}</p>

      <Orders unbooked={s.unbooked ?? []} />
    </section>
  )
}

interface Order { order_no: string; ordered_on: string | null; created_by: string | null; status: string | null; asked: number; corrected: number; allocated: number; invoiced: number; deleted: number; value_paise: number; invoiced_paise: number }
interface InvLine { invoice_no: string; sku_code: string; description: string | null; invoiced_on: string | null; order_no: string | null; qty: number; value_paise: number }
interface Unbooked { invoice_no: string; on: string | null; qty: number; value_paise: number; lines: number }

/** Pepsi's side of every order: what we asked for, what they changed it to, what they invoiced; plus invoices not yet entered as purchases. */
function Orders({ unbooked }: { unbooked: Unbooked[] }) {
  const { t } = useTranslation()
  const orders = useQuery({ queryKey: ['oms_order'], queryFn: () => must<Order[]>(supabase.from('oms_order').select('*').order('ordered_on', { ascending: false }).limit(30)) })
  const lines = useQuery({ queryKey: ['oms_invoice_line'], queryFn: () => must<InvLine[]>(supabase.from('oms_invoice_line').select('*').order('invoiced_on', { ascending: false }).limit(500)) })
  const [open, setOpen] = useState<string | null>(null)
  const invoices = useMemo(() => {
    const m = new Map<string, { no: string; on: string | null; qty: number; value: number; lines: InvLine[] }>()
    for (const l of lines.data ?? []) { const x = m.get(l.invoice_no) ?? { no: l.invoice_no, on: l.invoiced_on, qty: 0, value: 0, lines: [] }; x.qty += l.qty; x.value += l.value_paise; x.lines.push(l); m.set(l.invoice_no, x) }
    return [...m.values()]
  }, [lines.data])
  const pending = new Set(unbooked.map((u) => u.invoice_no))
  return (
    <>
      {!!unbooked.length && <Alert msg={{ kind: 'warn', text: t('pepsi.unbooked', { n: unbooked.length, list: unbooked.map((u) => `${u.invoice_no} (${u.on ?? ''}, ${u.qty} ${t('pepsi.cases')})`).join(', ') }) }} />}
      <div className="card stack" style={{ gap: 8 }}>
        <b>{t('pepsi.orders')}</b>
        {!orders.data?.length ? <span className="cell-sub">{t('pepsi.noOrders')}</span> : (
          <div className="table-wrap table-scroll"><table className="dense" data-testid="pepsi-orders">
            <thead><tr><th scope="col">{t('pepsi.order')}</th><th scope="col">{t('pepsi.asked')}</th><th scope="col">{t('pepsi.corrected')}</th><th scope="col">{t('pepsi.invoicedQty')}</th><th scope="col">{t('pepsi.value')}</th><th scope="col">{t('pepsi.status')}</th></tr></thead>
            <tbody>{orders.data.map((o) => (
              <tr key={o.order_no}>
                <th scope="row">{o.order_no}<div className="cell-sub">{o.ordered_on} · {o.created_by?.split('@')[0]}</div></th>
                <td className="num">{o.asked}</td>
                <td className="num">{o.corrected !== o.asked && o.corrected ? <b style={{ color: '#b45309' }}>{o.corrected}</b> : o.corrected || '—'}</td>
                <td className="num">{o.invoiced || '—'}</td>
                <td className="num">{formatPaise(o.invoiced_paise || o.value_paise)}</td>
                <td>{o.deleted && !o.corrected ? <span className="badge badge-red">{t('pepsi.cancelled')}</span> : <span className="badge">{o.status ?? '—'}</span>}</td>
              </tr>))}</tbody>
          </table></div>)}
        <p className="cell-sub" style={{ margin: 0 }}>{t('pepsi.ordersHow')}</p>
      </div>
      <div className="card stack" style={{ gap: 8 }}>
        <b>{t('pepsi.invoices')}</b>
        {!invoices.length ? <span className="cell-sub">{t('pepsi.noInvoices')}</span> : invoices.map((v) => (
          <div key={v.no} className="stack" style={{ gap: 4 }}>
            <button type="button" className="row-between" style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }} onClick={() => setOpen(open === v.no ? null : v.no)} aria-expanded={open === v.no}>
              <span><b>{v.no}</b> · {v.on} {pending.has(v.no) ? <span className="badge badge-amber">{t('pepsi.notEntered')}</span> : <span className="badge badge-green">{t('pepsi.entered')}</span>}</span>
              <span className="num">{v.qty} {t('pepsi.cases')} · {formatPaise(v.value)}</span>
            </button>
            {open === v.no && v.lines.map((l) => <div key={l.sku_code} className="row-between cell-sub"><span>{l.description}</span><span className="num">{l.qty} · {formatPaise(l.value_paise)}</span></div>)}
          </div>))}
        <p className="cell-sub" style={{ margin: 0 }}>{t('pepsi.invHow')}</p>
      </div>
    </>
  )
}
