import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BarChart3 } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { formatPaise } from '../../shared/money'
import { fixedTotal } from '../../shared/margin'
import { Empty, PageHeader, Skeleton } from '../../shared/ui/kit'
import { useMargin } from './marginData'
import { addDays, todayIST } from './opsData'

// Products (owner, 12 Nov 2026; reworked same day). Contribution-margin view, the standard for SKU profitability:
// each case "earns" sale price - buy price - delivery cost. Salaries and other fixed costs are NOT split per product
// (a per-case "target" changes with volume and misleads: selling more at a lower price can be better). Instead all
// products together must cover the fixed costs, shown in one cover card, and each card has a price what-if:
// "at ₹X you need N cases to earn the same" (cases × earn ÷ new earn).
interface Sale { pack_id: string; cases: number; rev: number; cost: number; days: number; series: Record<string, number> | null; last_buy: number | null; last_buy_on: string | null; on_hand: number | null }
type Sort = 'earned' | 'volume' | 'perCase' | 'loss'
const r = (p: number) => formatPaise(Math.round(p / 100) * 100)
const C = { buy: '#64748b', sell: '#16a34a', trade: '#2563eb', loss: '#fecaca', ok: '#bbf7d0' }

type Row = { p: { id: string; name_en: string }; cases: number; avgSell: number | null; buy: number | null; breakEven: number | null; trade: number | null
  earn: number | null; earned: number; share: number; series: Record<string, number>; onHand: number | null; cover: number | null }

export default function ProductsPage() {
  const { t } = useTranslation()
  const [days, setDays] = useState(30)
  const [sort, setSort] = useState<Sort>('earned')
  const mg = useMargin()
  const sales = useQuery({ queryKey: ['product_sales', days], queryFn: () => must<Sale[]>(supabase.rpc('product_sales', { p_days: days })) })

  const data = useMemo(() => {
    if (!mg || !sales.data) return null
    const variable = mg.cost.variable
    const by = new Map(sales.data.map((s) => [s.pack_id, s]))
    const list = mg.packs.filter((p) => p.active && (mg.byPack.has(p.id) || by.has(p.id))).map((p) => {
      const price = mg.byPack.get(p.id), s = by.get(p.id)
      const cases = s?.cases ?? 0
      const avgSell = cases ? s!.rev / cases : null
      const avgCost = cases && s!.cost ? s!.cost / cases : null
      const buy = avgCost ?? s?.last_buy ?? price?.buy ?? null
      const earn = avgSell != null && buy != null ? avgSell - buy - variable : null
      const perDay = cases / days
      return { p, cases, avgSell, buy, breakEven: buy != null ? buy + variable : null, trade: price?.trade ?? null, earn, earned: (earn ?? 0) * cases, share: 0,
        series: s?.series ?? {}, onHand: s?.on_hand ?? null, cover: perDay > 0 && s?.on_hand != null ? s.on_hand / perDay : null }
    })
    const earned = list.reduce((a, x) => a + x.earned, 0)
    for (const x of list) x.share = earned > 0 ? x.earned / earned : 0
    const cases = list.reduce((a, x) => a + x.cases, 0)
    list.sort((a, b) => sort === 'volume' ? b.cases - a.cases : sort === 'perCase' ? (b.earn ?? -1e9) - (a.earn ?? -1e9)
      : sort === 'loss' ? (a.earn ?? 1e9) - (b.earn ?? 1e9) : b.earned - a.earned)
    // Fixed costs only for the days we actually sold (same rule as Kharcha: monthly ÷ working days, per day with sales),
    // so a new business or a short period isn't compared against a full month of salaries.
    const active = new Set(list.flatMap((x) => Object.keys(x.series).filter((k) => Number(x.series[k]) > 0))).size
    const fixed = Math.round((fixedTotal(mg.s) * active) / (mg.s.working_days || 26))
    const top = [...list].sort((a, b) => b.earned - a.earned)
    let acc = 0, topN = 0
    for (const x of top) { if (acc >= 0.8 * earned || x.earned <= 0) break; acc += x.earned; topN++ }
    return { list, earned, cases, fixed, active, avgEarn: cases ? earned / cases : 0, losing: list.filter((x) => x.cases && (x.earn ?? 0) < 0).length, topN }
  }, [mg, sales.data, sort, days])

  if (!data) return <Skeleton rows={8} />
  return (
    <section className="stack-lg">
      <PageHeader title={t('prod.title')} sub={t('prod.sub')} />
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="segmented" role="tablist" aria-label={t('prod.period')}>
          {[7, 30, 90].map((d) => <button key={d} type="button" role="tab" className="btn-sm" aria-selected={days === d} onClick={() => setDays(d)}>{t('prod.days', { n: d })}</button>)}
        </div>
        <div className="segmented" role="tablist" aria-label={t('prod.sortBy')}>
          {(['earned', 'volume', 'perCase', 'loss'] as Sort[]).map((s) => <button key={s} type="button" role="tab" className="btn-sm" aria-selected={sort === s} onClick={() => setSort(s)}>{t(`prod.sort.${s}`)}</button>)}
        </div>
      </div>

      <CoverCard earned={data.earned} fixed={data.fixed} active={data.active} avgEarn={data.avgEarn} days={days} />

      <div className="stats">
        <div className="stat"><div className="label">{t('prod.kCasesL')}</div><div className="value num">{data.cases}</div><div className="cell-sub">{t('prod.kDays', { n: days })}</div></div>
        <div className="stat"><div className="label">{t('prod.kAvg')}</div><div className="value num">{r(data.avgEarn)}</div><div className="cell-sub">{t('prod.kAvgSub')}</div></div>
        <div className="stat"><div className="label">{t('prod.kTop')}</div><div className="value num">{data.topN}</div><div className="cell-sub">{t('prod.kTopSub')}</div></div>
        <div className="stat"><div className="label">{t('prod.kLoss')}</div><div className="value num" style={data.losing ? { color: 'var(--danger, #dc2626)' } : undefined}>{data.losing}</div><div className="cell-sub">{t('prod.kLossSub')}</div></div>
      </div>

      <Legend />

      {!data.list.length ? <Empty icon={<BarChart3 size={24} />} title={t('prod.none')} /> : (
        <div className="prod-grid">{data.list.map((x) => <ProductCard key={x.p.id} x={x} days={days} avgEarn={data.avgEarn} />)}</div>
      )}
    </section>
  )
}

/** All products together vs the fixed costs (salaries etc.) for the same days. */
function CoverCard({ earned, fixed, active, avgEarn, days }: { earned: number; fixed: number; active: number; avgEarn: number; days: number }) {
  const { t } = useTranslation()
  const pct = fixed > 0 ? Math.max(0, earned / fixed) : 1
  const short = fixed - earned
  return (
    <div className="card stack" data-testid="prod-cover" style={{ gap: 8 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
        <b>{t('prod.cover.title', { n: days })}</b>
        <span className={`badge ${pct >= 1 ? 'badge-green' : 'badge-amber'}`}>{t('prod.cover.pct', { n: Math.round(pct * 100) })}</span>
      </div>
      <div className="prod-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, pct * 100)}%`, background: pct >= 1 ? '#22c55e' : '#f59e0b' }} /></div>
      <div className="row-between cell-sub" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span>{t('prod.cover.earned', { v: r(earned) })}</span><span>{t('prod.cover.fixed', { v: r(fixed), d: active })}</span>
      </div>
      <p style={{ margin: 0 }}>{short > 0
        ? (avgEarn > 0 ? t('prod.cover.short', { v: r(short), n: Math.ceil(short / avgEarn), a: r(avgEarn) }) : t('prod.cover.shortNoAvg', { v: r(short) }))
        : t('prod.cover.profit', { v: r(-short) })}</p>
    </div>)
}

function Legend() {
  const { t } = useTranslation()
  const item = (c: string, k: string, shape: 'dot' | 'dia' | 'sq') => <span className="row" style={{ gap: 6 }}><Mark c={c} shape={shape} />{t(`prod.l.${k}`)}</span>
  return (
    <div className="card row cell-sub" style={{ flexWrap: 'wrap', gap: 14, padding: '10px 14px' }}>
      {item(C.buy, 'buy', 'dot')}{item(C.sell, 'sell', 'dia')}{item(C.trade, 'trade', 'sq')}
      <span className="row" style={{ gap: 6 }}><i style={{ width: 22, height: 8, borderRadius: 4, background: `linear-gradient(90deg,${C.loss} 50%,${C.ok} 50%)` }} />{t('prod.l.zones')}</span>
    </div>)
}
function Mark({ c, shape, x = 7, y = 7, s = 6 }: { c: string; shape: 'dot' | 'dia' | 'sq'; x?: number; y?: number; s?: number }) {
  const el = shape === 'dot' ? <circle cx={x} cy={y} r={s - 1} fill={c} />
    : shape === 'dia' ? <path d={`M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y}Z`} fill={c} />
    : <rect x={x - s + 1} y={y - s + 1} width={2 * s - 2} height={2 * s - 2} rx={1.5} fill={c} />
  return x === 7 && y === 7 ? <svg width={14} height={14} aria-hidden="true">{el}</svg> : el
}

function ProductCard({ x, days, avgEarn }: { x: Row; days: number; avgEarn: number }) {
  const { t } = useTranslation()
  const status = x.earn == null ? 'none' : x.earn < 0 ? 'loss' : x.earn < avgEarn ? 'low' : 'ok'
  const badge = { none: 'badge', loss: 'badge badge-red', low: 'badge badge-amber', ok: 'badge badge-green' }[status]
  return (
    <article className="card stack prod-card" data-testid="prod-card">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div><h3 style={{ margin: 0 }}>{x.p.name_en}</h3>
          <div className="cell-sub">{x.cases ? t('prod.sold', { n: x.cases, d: days }) : t('prod.notSold', { d: days })}{x.onHand != null ? ` · ${t('prod.stock', { n: x.onHand })}` : ''}{x.cover != null ? ` · ${t('prod.coverDays', { n: Math.round(x.cover) })}` : ''}</div></div>
        <span className={badge}>{t(`prod.st.${status}`)}</span>
      </div>
      <Ladder x={x} />
      <div className="prod-nums">
        <div><span>{t('prod.l.buy')}</span><b className="num">{x.buy != null ? r(x.buy) : '—'}</b></div>
        <div><span>{t('prod.l.sell')}</span><b className="num" style={{ color: C.sell }}>{x.avgSell != null ? r(x.avgSell) : '—'}</b></div>
        <div><span>{t('prod.earn')}</span><b className="num" style={x.earn != null && x.earn < 0 ? { color: '#dc2626' } : undefined}>{x.earn != null ? r(x.earn) : '—'}</b></div>
        <div><span>{t('prod.earned', { n: days })}</span><b className="num">{x.cases ? r(x.earned) : '—'}</b>{x.share > 0 && <small className="cell-sub">{t('prod.share', { n: Math.round(x.share * 100) })}</small>}</div>
      </div>
      <Trend series={x.series} days={days} />
      {x.cases > 0 && x.avgSell != null && x.breakEven != null && <WhatIf x={x as Row & { avgSell: number; breakEven: number }} />}
    </article>)
}

/** Try another price: earn per case at that price and the cases needed to earn the same total as now. */
function WhatIf({ x }: { x: Row & { avgSell: number; breakEven: number } }) {
  const { t } = useTranslation()
  const base = Math.round(x.avgSell / 100)
  const [rs, setRs] = useState(String(base))
  const price = Math.round(Number(rs) * 100)
  const valid = Number(rs) > 0
  const earn = price - x.breakEven
  const now = x.earned
  let line: string
  if (!valid) line = ''
  else if (earn <= 0) line = t('prod.w.loss', { p: r(price), v: r(-earn) })
  else if (now <= 0) line = t('prod.w.fromLoss', { p: r(price), e: r(earn) })
  else {
    const need = Math.ceil(now / earn), diff = need - x.cases
    line = diff > 0 ? t('prod.w.more', { p: r(price), e: r(earn), n: need, m: x.cases, pct: Math.round((diff / x.cases) * 100) })
      : diff < 0 ? t('prod.w.fewer', { p: r(price), e: r(earn), n: need, m: x.cases, pct: Math.round((-diff / x.cases) * 100) })
      : t('prod.w.same', { p: r(price), e: r(earn) })
  }
  return (
    <div className="prod-whatif">
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="cell-sub">{t('prod.w.try')}</span>
        {[-10, -5, 5, 10].map((d) => <button key={d} type="button" className="btn-sm" onClick={() => setRs(String(Math.max(1, Number(rs || base) + d)))}>{d > 0 ? `+₹${d}` : `−₹${-d}`}</button>)}
        <label className="row" style={{ gap: 4 }}>₹<input className="input num" inputMode="numeric" style={{ width: 72, padding: '4px 8px' }} value={rs}
          onChange={(e) => setRs(e.target.value.replace(/[^\d]/g, ''))} aria-label={t('prod.w.aria')} /></label>
      </div>
      {line && <p className="cell-sub" style={{ margin: '6px 0 0' }}>{line}</p>}
    </div>)
}

/** Price line: red below buy + delivery (every case loses), green above. Markers for buy, average sold and Pepsi rate. */
function Ladder({ x }: { x: Row }) {
  const { t } = useTranslation()
  const vals = [x.buy, x.breakEven, x.avgSell, x.trade].filter((v): v is number => v != null && v > 0)
  if (!vals.length) return null
  const lo = Math.min(...vals) * 0.985, hi = Math.max(...vals) * 1.015
  const W = 320, H = 54, L = 8, R = 8, Y = 30
  const px = (v: number) => L + ((v - lo) / (hi - lo || 1)) * (W - L - R)
  const be = x.breakEven ?? lo
  const marks: { v: number | null; c: string; shape: 'dot' | 'dia' | 'sq'; k: string; up: boolean }[] = [
    { v: x.buy, c: C.buy, shape: 'dot', k: 'buy', up: false }, { v: x.trade, c: C.trade, shape: 'sq', k: 'trade', up: true },
    { v: x.avgSell, c: C.sell, shape: 'dia', k: 'sell', up: x.trade == null || Math.abs(px(x.trade) - px(x.avgSell ?? 0)) > 40 }]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="prod-ladder" role="img"
      aria-label={t('prod.ladderAria', { b: x.buy != null ? r(x.buy) : '—', s: x.avgSell != null ? r(x.avgSell) : '—', p: x.trade != null ? r(x.trade) : '—' })}>
      <rect x={L} y={Y - 5} width={Math.max(0, px(be) - L)} height={10} rx={5} fill={C.loss} />
      <rect x={px(be)} y={Y - 5} width={Math.max(0, W - R - px(be))} height={10} rx={5} fill={C.ok} />
      {x.avgSell != null && x.buy != null && <line x1={px(x.buy)} x2={px(x.avgSell)} y1={Y} y2={Y} stroke={C.sell} strokeWidth={3} strokeLinecap="round" opacity={0.55} />}
      {marks.filter((m) => m.v != null).map((m) => (
        <g key={m.k}><Mark c={m.c} shape={m.shape} x={px(m.v!)} y={Y} s={m.k === 'sell' ? 7.5 : 6} />
          <text x={px(m.v!)} y={m.up ? 12 : H - 2} textAnchor="middle" fontSize={10} fill={m.c} fontWeight={700}>{r(m.v!)}</text></g>))}
    </svg>)
}

/** Daily cases over the period as slim bars, with the average line. */
function Trend({ series, days }: { series: Record<string, number>; days: number }) {
  const { t } = useTranslation()
  const today = todayIST()
  const pts = Array.from({ length: days }, (_, i) => Number(series[addDays(today, i - days + 1)] ?? 0))
  const max = Math.max(1, ...pts), avg = pts.reduce((a, b) => a + b, 0) / days
  const W = 320, H = 40, bw = W / days
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="prod-trend" role="img" aria-label={t('prod.trendAria', { n: days })}>
        {pts.map((v, i) => <rect key={i} x={i * bw + bw * 0.15} width={bw * 0.7} y={H - (v / max) * (H - 4)} height={(v / max) * (H - 4)} rx={Math.min(2, bw * 0.3)} fill={v ? '#22c55e' : '#e5e7eb'} />)}
        {avg > 0 && <line x1={0} x2={W} y1={H - (avg / max) * (H - 4)} y2={H - (avg / max) * (H - 4)} stroke="#0f172a" strokeDasharray="3 3" strokeWidth={1} opacity={0.5} />}
      </svg>
      <div className="row-between cell-sub"><span>{t('prod.daysAgo', { n: days })}</span><span>{t('prod.avgDay', { n: avg.toFixed(1) })}</span><span>{t('prod.todayLbl')}</span></div>
    </div>)
}
