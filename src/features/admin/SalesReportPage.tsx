import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FileDown } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { Alert, Empty, PageHeader, Skeleton } from '../../shared/ui/kit'
import { itemName, niceDate, periodOf, reportHtml, rupees, type SalesReport } from '../../shared/salesReport.js'
import { todayIST } from './opsData'

// Sales report (owner, 13 Nov 2026): everything sold, any period, always live. "Download PDF" prints the same document
// the autopilot sends to Telegram (src/shared/salesReport.js). Admin only (shows margin).
const KINDS = ['till', 'month', 'lastmonth', 'week', 'today', 'custom'] as const
type Kind = (typeof KINDS)[number]
type SortKey = 'cases' | 'amount_paise' | 'margin_paise' | 'shops' | 'item'

export default function SalesReportPage() {
  const { t } = useTranslation()
  const today = todayIST()
  const [kind, setKind] = useState<Kind>('till')
  const [custom, setCustom] = useState({ from: today.slice(0, 8) + '01', to: today })
  const [sort, setSort] = useState<SortKey>('cases')
  const [q, setQ] = useState('')
  const p = kind === 'custom' ? { ...custom, label: `${niceDate(custom.from)} – ${niceDate(custom.to)}` } : periodOf(kind, today)
  const badRange = kind === 'custom' && (!custom.from || !custom.to || custom.from > custom.to)
  const rep = useQuery({ queryKey: ['sales_report', p.from, p.to], enabled: !badRange, refetchInterval: 120_000,
    queryFn: () => must<SalesReport>(supabase.rpc('sales_report', { p_from: p.from, p_to: p.to })) })

  const items = useMemo(() => {
    const list = (rep.data?.by_item ?? []).filter((i) => itemName(i.item).toLowerCase().includes(q.trim().toLowerCase()))
    return [...list].sort((a, b) => (sort === 'item' ? itemName(a.item).localeCompare(itemName(b.item)) : Number(b[sort]) - Number(a[sort])))
  }, [rep.data, sort, q])

  const pdf = () => {
    if (!rep.data) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(reportHtml(rep.data, { title: t('srep.title'), label: p.label, generatedAt: new Date().toISOString() }))
    w.document.close()
    w.onload = () => { w.focus(); w.print() }
    setTimeout(() => { try { w.focus(); w.print() } catch { /* closed */ } }, 600)
  }

  const r = rep.data, tt = r?.totals
  const net = Number(tt?.net_paise ?? 0), cases = Number(tt?.cases ?? 0), bills = Math.max(1, Number(tt?.bills ?? 0))
  const maxDay = Math.max(1, ...(r?.by_day ?? []).map((d) => Number(d.amount_paise)))
  const th = (k: SortKey, label: string, num = true) => (
    <th scope="col" className={num ? 'num' : undefined} aria-sort={sort === k ? 'descending' : 'none'}>
      <button type="button" className="th-sort" onClick={() => setSort(k)}>{label}{sort === k ? ' ▾' : ''}</button></th>)

  return (
    <section className="stack-lg">
      <PageHeader title={t('srep.title')} sub={t('srep.sub')}
        actions={<button type="button" onClick={pdf} disabled={!r} data-testid="srep-pdf"><FileDown size={18} aria-hidden="true" /> {t('srep.pdf')}</button>} />
      <div className="segmented" role="tablist" aria-label={t('srep.period')} style={{ flexWrap: 'wrap' }}>
        {KINDS.map((k) => <button key={k} type="button" role="tab" className="btn-sm" aria-selected={kind === k} onClick={() => setKind(k)}>{t(`srep.k.${k}`)}</button>)}
      </div>
      {kind === 'custom' && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="stack" style={{ gap: 2 }}><span className="cell-sub">{t('srep.from')}</span><input className="input" type="date" value={custom.from} max={today} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
          <label className="stack" style={{ gap: 2 }}><span className="cell-sub">{t('srep.to')}</span><input className="input" type="date" value={custom.to} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
        </div>)}
      {badRange && <Alert msg={{ kind: 'error', text: t('srep.badRange') }} />}
      {rep.isError && <Alert msg={{ kind: 'error', text: t('srep.error') }} />}
      {!badRange && rep.isLoading && <Skeleton rows={8} />}
      {r && !Number(tt?.bills) && <Empty icon={<FileDown size={24} />} title={t('srep.none')} />}
      {r && !!Number(tt?.bills) && <>
        <p className="muted" style={{ margin: 0 }}>{p.label} · {niceDate(r.first_sale && r.from < r.first_sale ? r.first_sale : r.from)} – {niceDate(r.to)}</p>
        <div className="stats" data-testid="srep-totals">
          <Stat l={t('srep.sales')} v={rupees(net)} s={Number(tt!.discount_paise) ? t('srep.afterDisc', { v: rupees(tt!.discount_paise) }) : t('srep.allBills')} />
          <Stat l={t('srep.cases')} v={cases.toLocaleString('en-IN')} s={t('srep.units', { n: Number(tt!.units).toLocaleString('en-IN') })} />
          <Stat l={t('srep.bills')} v={String(tt!.bills)} s={t('srep.days', { n: tt!.days })} />
          <Stat l={t('srep.shops')} v={String(tt!.shops)} s={t('srep.items', { n: tt!.items })} />
          <Stat l={t('srep.avgBill')} v={rupees(net / bills)} s={t('srep.casesBill', { n: (cases / bills).toFixed(1) })} />
          <Stat l={t('srep.perCase')} v={rupees(net / Math.max(1, cases))} s={t('srep.rate')} />
          <Stat l={t('srep.perDay')} v={rupees(net / Math.max(1, Number(tt!.days)))} s={t('srep.casesDay', { n: Math.round(cases / Math.max(1, Number(tt!.days))) })} />
          <Stat l={t('srep.margin')} v={rupees(tt!.margin_paise)} s={t('srep.marginSub', { p: net ? ((Number(tt!.margin_paise) / net) * 100).toFixed(1) : '0', c: rupees(Number(tt!.margin_paise) / Math.max(1, cases)) })} />
        </div>

        <div className="card stack" style={{ gap: 8 }}>
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>{t('srep.itemsSold')} ({items.length})</h2>
            <input className="input" style={{ maxWidth: 220 }} placeholder={t('srep.search')} aria-label={t('srep.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="table-wrap table-scroll"><table className="dense" data-testid="srep-items">
            <thead><tr>{th('item', t('srep.item'), false)}{th('cases', t('srep.cases'))}<th scope="col" className="num">{t('srep.bottles')}</th>{th('amount_paise', t('srep.amount'))}
              <th scope="col" className="num">{t('srep.avgRate')}</th>{th('margin_paise', t('srep.marginCol'))}{th('shops', t('srep.shopsCol'))}<th scope="col" className="num">{t('srep.lastSold')}</th></tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.item}><th scope="row">{itemName(i.item)}<div className="cell-sub">{i.brand}</div></th>
                <td className="num"><b>{i.cases}</b></td><td className="num">{Number(i.units).toLocaleString('en-IN')}</td><td className="num">{rupees(i.amount_paise)}</td>
                <td className="num">{rupees(i.avg_rate_paise)}</td><td className="num" style={{ color: Number(i.margin_paise) < 0 ? '#dc2626' : undefined }}>{rupees(i.margin_paise)}</td>
                <td className="num">{i.shops}</td><td className="num">{niceDate(i.last_sold)}</td></tr>))}</tbody>
            <tfoot><tr><th scope="row">{t('srep.total')}</th><td className="num"><b>{cases}</b></td><td className="num">{Number(tt!.units).toLocaleString('en-IN')}</td><td className="num">{rupees(tt!.gross_paise)}</td>
              <td className="num">{rupees(Number(tt!.gross_paise) / Math.max(1, cases))}</td><td className="num">{rupees(Number(tt!.margin_paise) + Number(tt!.discount_paise))}</td><td /><td /></tr></tfoot>
          </table></div>
        </div>

        <div className="srep-grid">
          <div className="card stack" style={{ gap: 6 }}><h2 style={{ margin: 0, fontSize: 17 }}>{t('srep.byBrand')}</h2>
            {r.by_brand.map((b) => <Bar key={b.brand} label={b.brand} right={`${b.cases} · ${rupees(b.amount_paise)}`} pct={Number(b.amount_paise) / Math.max(1, Number(tt!.gross_paise))} />)}</div>
          <div className="card stack" style={{ gap: 6 }}><h2 style={{ margin: 0, fontSize: 17 }}>{t('srep.howSold')}</h2>
            {r.by_channel.map((c) => <Bar key={c.channel} label={t(`srep.ch.${c.channel}`)} right={`${c.bills} ${t('srep.billsShort')} · ${rupees(c.net)}`} pct={Number(c.net) / Math.max(1, Number(tt!.gross_paise))} />)}
            <h3 style={{ margin: '8px 0 0', fontSize: 15 }}>{t('srep.payment')}</h3>
            {r.by_mode.map((m) => <Bar key={m.mode} label={t(`srep.mode.${m.mode}`)} right={`${m.bills} ${t('srep.billsShort')} · ${rupees(m.net)}`} pct={Number(m.net) / Math.max(1, net)} />)}</div>
        </div>

        <div className="card stack" style={{ gap: 6 }}><h2 style={{ margin: 0, fontSize: 17 }}>{t('srep.byDay')}</h2>
          {r.by_day.map((d) => <Bar key={d.dy} label={niceDate(d.dy)} right={`${d.bills} ${t('srep.billsShort')} · ${d.cases} ${t('srep.casesShort')} · ${rupees(d.amount_paise)}`} pct={Number(d.amount_paise) / maxDay} />)}</div>

        <div className="card stack" style={{ gap: 8 }}><h2 style={{ margin: 0, fontSize: 17 }}>{t('srep.topShops')}</h2>
          <div className="table-wrap table-scroll"><table className="dense">
            <thead><tr><th scope="col">{t('srep.shop')}</th><th scope="col" className="num">{t('srep.bills')}</th><th scope="col" className="num">{t('srep.cases')}</th><th scope="col" className="num">{t('srep.amount')}</th></tr></thead>
            <tbody>{r.top_shops.map((s) => <tr key={s.name + s.locality}><th scope="row">{s.name}<div className="cell-sub">{s.locality}</div></th><td className="num">{s.bills}</td><td className="num">{s.cases}</td><td className="num">{rupees(s.amount_paise)}</td></tr>)}</tbody>
          </table></div></div>
        <p className="muted">{t('srep.note')}</p>
      </>}
    </section>
  )
}

function Stat({ l, v, s }: { l: string; v: string; s?: string }) {
  return <div className="stat"><div className="label">{l}</div><div className="value num">{v}</div>{s && <div className="cell-sub">{s}</div>}</div>
}
function Bar({ label, right, pct }: { label: string; right: string; pct: number }) {
  return (
    <div className="stack" style={{ gap: 3 }}>
      <div className="row-between cell-sub" style={{ gap: 8 }}><span style={{ color: 'var(--text, #0f172a)' }}>{label}</span><span className="num">{right}</span></div>
      <div className="srep-bar"><i style={{ width: `${Math.max(2, Math.min(100, pct * 100))}%` }} /></div>
    </div>)
}
