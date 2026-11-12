import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BarChart3 } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { formatPaise } from '../../shared/money'
import { Empty, PageHeader, Skeleton } from '../../shared/ui/kit'
import { useMargin } from './marginData'
import { addDays, todayIST } from './opsData'

// Products: per-product "price ladder" (owner, 12 Nov 2026). Inspired by SKU profitability boards: one row per SKU
// with buy cost, real average selling price, the price we must get (target), Pepsi's rate, margin per case and volume.
// Hand-drawn SVG (no chart library): small, sharp on phones, prints well.
interface Sale { pack_id: string; cases: number; rev: number; cost: number; days: number; series: Record<string, number> | null; last_buy: number | null; last_buy_on: string | null; on_hand: number | null }
type Sort = 'profit' | 'volume' | 'margin' | 'below'
const r = (p: number) => formatPaise(Math.round(p / 100) * 100)
const C = { buy: '#64748b', floor: '#ef4444', target: '#f59e0b', sell: '#16a34a', trade: '#2563eb' }

export default function ProductsPage() {
  const { t } = useTranslation()
  const [days, setDays] = useState(30)
  const [sort, setSort] = useState<Sort>('profit')
  const mg = useMargin()
  const sales = useQuery({ queryKey: ['product_sales', days], queryFn: () => must<Sale[]>(supabase.rpc('product_sales', { p_days: days })) })

  const rows = useMemo(() => {
    if (!mg || !sales.data) return []
    const by = new Map(sales.data.map((s) => [s.pack_id, s]))
    return mg.packs.filter((p) => p.active && (mg.byPack.has(p.id) || by.has(p.id))).map((p) => {
      const price = mg.byPack.get(p.id), s = by.get(p.id)
      const cases = s?.cases ?? 0
      const avgSell = cases ? s!.rev / cases : null
      const avgCost = cases && s!.cost ? s!.cost / cases : null
      const buy = s?.last_buy ?? avgCost ?? price?.buy ?? null
      const target = price?.min ?? null, floor = price?.floor ?? null, trade = price?.trade ?? null
      const perCase = avgSell != null && avgCost != null ? avgSell - avgCost : null
      const profit = perCase != null ? perCase * cases : null     // margin earned, same basis as the summary cards
      const gap = avgSell != null && target != null ? avgSell - target : null
      const perDay = s?.days ? cases / days : 0
      return { p, cases, avgSell, buy, target, floor, trade, perCase, profit, gap, series: s?.series ?? {}, onHand: s?.on_hand ?? null, cover: perDay > 0 && s?.on_hand != null ? s.on_hand / perDay : null, lastBuyOn: s?.last_buy_on }
    }).sort((a, b) => sort === 'volume' ? b.cases - a.cases : sort === 'margin' ? (b.perCase ?? -1e9) - (a.perCase ?? -1e9)
      : sort === 'below' ? (a.gap ?? 1e9) - (b.gap ?? 1e9) : (b.profit ?? -1e12) - (a.profit ?? -1e12))
  }, [mg, sales.data, sort, days])

  if (!mg || sales.isLoading) return <Skeleton rows={8} />
  const sold = rows.filter((x) => x.cases > 0)
  const totalMargin = sold.reduce((a, x) => a + (x.perCase ?? 0) * x.cases, 0)
  const below = sold.filter((x) => (x.gap ?? 0) < 0)
  const best = [...sold].sort((a, b) => (b.perCase ?? 0) * b.cases - (a.perCase ?? 0) * a.cases)[0]

  return (
    <section className="stack-lg">
      <PageHeader title={t('prod.title')} sub={t('prod.sub')} />
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="segmented" role="tablist" aria-label={t('prod.period')}>
          {[7, 30, 90].map((d) => <button key={d} type="button" role="tab" className="btn-sm" aria-selected={days === d} onClick={() => setDays(d)}>{t('prod.days', { n: d })}</button>)}
        </div>
        <div className="segmented" role="tablist" aria-label={t('prod.sortBy')}>
          {(['profit', 'volume', 'margin', 'below'] as Sort[]).map((s) => <button key={s} type="button" role="tab" className="btn-sm" aria-selected={sort === s} onClick={() => setSort(s)}>{t(`prod.sort.${s}`)}</button>)}
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="label">{t('prod.kMargin', { n: days })}</div><div className="value num">{r(totalMargin)}</div><div className="cell-sub">{t('prod.kCases', { n: sold.reduce((a, x) => a + x.cases, 0) })}</div></div>
        <div className="stat"><div className="label">{t('prod.kBest')}</div><div className="value" style={{ fontSize: 18 }}>{best?.p.name_en ?? '—'}</div><div className="cell-sub">{best ? t('prod.kBestSub', { v: r((best.perCase ?? 0) * best.cases) }) : ''}</div></div>
        <div className="stat"><div className="label">{t('prod.kBelow')}</div><div className="value num" style={below.length ? { color: 'var(--warn)' } : undefined}>{below.length}</div><div className="cell-sub">{t('prod.kBelowSub')}</div></div>
      </div>

      <Legend />

      {!rows.length ? <Empty icon={<BarChart3 size={24} />} title={t('prod.none')} /> : (
        <div className="prod-grid">{rows.map((x) => <ProductCard key={x.p.id} x={x} days={days} />)}</div>
      )}
    </section>
  )
}

function Legend() {
  const { t } = useTranslation()
  const item = (c: string, k: string, shape: 'dot' | 'tri' | 'dia' | 'sq') => (
    <span className="row" style={{ gap: 6 }}><Mark c={c} shape={shape} />{t(`prod.l.${k}`)}</span>)
  return (
    <div className="card row cell-sub" style={{ flexWrap: 'wrap', gap: 14, padding: '10px 14px' }}>
      {item(C.buy, 'buy', 'dot')}{item(C.target, 'target', 'tri')}{item(C.sell, 'sell', 'dia')}{item(C.trade, 'trade', 'sq')}
      <span className="row" style={{ gap: 6 }}><i style={{ width: 22, height: 8, borderRadius: 4, background: 'linear-gradient(90deg,#fecaca,#fde68a,#bbf7d0)' }} />{t('prod.l.zones')}</span>
    </div>)
}
function Mark({ c, shape, x = 7, y = 7, s = 6 }: { c: string; shape: 'dot' | 'tri' | 'dia' | 'sq'; x?: number; y?: number; s?: number }) {
  const el = shape === 'dot' ? <circle cx={x} cy={y} r={s - 1} fill={c} />
    : shape === 'tri' ? <path d={`M${x} ${y - s} L${x + s} ${y + s - 1} L${x - s} ${y + s - 1}Z`} fill={c} />
    : shape === 'dia' ? <path d={`M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y}Z`} fill={c} />
    : <rect x={x - s + 1} y={y - s + 1} width={2 * s - 2} height={2 * s - 2} rx={1.5} fill={c} />
  return x === 7 && y === 7 ? <svg width={14} height={14} aria-hidden="true">{el}</svg> : el
}

type Row = { p: { id: string; name_en: string }; cases: number; avgSell: number | null; buy: number | null; target: number | null; floor: number | null; trade: number | null
  perCase: number | null; profit: number | null; gap: number | null; series: Record<string, number>; onHand: number | null; cover: number | null; lastBuyOn?: string | null }

function ProductCard({ x, days }: { x: Row; days: number }) {
  const { t } = useTranslation()
  const status = x.avgSell == null ? 'none' : x.floor != null && x.avgSell < x.floor ? 'loss' : (x.gap ?? 0) < 0 ? 'low' : 'ok'
  const badge = { none: 'badge', loss: 'badge badge-red', low: 'badge badge-amber', ok: 'badge badge-green' }[status]
  return (
    <article className="card stack prod-card" data-testid="prod-card">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div><h3 style={{ margin: 0 }}>{x.p.name_en}</h3>
          <div className="cell-sub">{x.cases ? t('prod.sold', { n: x.cases, d: days }) : t('prod.notSold', { d: days })}{x.onHand != null ? ` · ${t('prod.stock', { n: x.onHand })}` : ''}{x.cover != null ? ` · ${t('prod.cover', { n: Math.round(x.cover) })}` : ''}</div></div>
        <span className={badge}>{t(`prod.st.${status}`)}</span>
      </div>
      <Ladder x={x} />
      <div className="prod-nums">
        <div><span>{t('prod.l.buy')}</span><b className="num">{x.buy != null ? r(x.buy) : '—'}</b></div>
        <div><span>{t('prod.l.sell')}</span><b className="num" style={{ color: C.sell }}>{x.avgSell != null ? r(x.avgSell) : '—'}</b></div>
        <div><span>{t('prod.l.target')}</span><b className="num" style={{ color: C.target }}>{x.target != null ? r(x.target) : '—'}</b></div>
        <div><span>{t('prod.perCase')}</span><b className="num">{x.perCase != null ? r(x.perCase) : '—'}</b></div>
      </div>
      <Trend series={x.series} days={days} />
      <p className="cell-sub prod-advice">{advice(t, x)}</p>
    </article>)
}

function advice(t: (k: string, o?: Record<string, unknown>) => string, x: Row) {
  if (x.avgSell == null) return x.target != null ? t('prod.a.noSale', { v: r(x.target) }) : ''
  if (x.floor != null && x.avgSell < x.floor) return t('prod.a.loss', { v: r(x.floor - x.avgSell), t: r(x.target ?? x.floor) })
  if ((x.gap ?? 0) < 0) return t('prod.a.low', { v: r(-(x.gap ?? 0)), t: r(x.target ?? 0), m: r(-(x.gap ?? 0) * x.cases) })
  return t('prod.a.ok', { v: r(x.gap ?? 0) })
}

/** Horizontal price ladder: loss / thin / healthy zones with buy, target, average sold and Pepsi rate markers. */
function Ladder({ x }: { x: Row }) {
  const { t } = useTranslation()
  const vals = [x.buy, x.floor, x.target, x.avgSell, x.trade].filter((v): v is number => v != null && v > 0)
  if (!vals.length) return null
  const lo = Math.min(...vals) * 0.985, hi = Math.max(...vals) * 1.015
  const W = 320, H = 54, L = 8, R = 8, Y = 30
  const px = (v: number) => L + ((v - lo) / (hi - lo || 1)) * (W - L - R)
  const fl = x.floor ?? x.buy ?? lo, tg = x.target ?? fl
  const marks: { v: number | null; c: string; shape: 'dot' | 'tri' | 'dia' | 'sq'; k: string; up: boolean }[] = [
    { v: x.buy, c: C.buy, shape: 'dot', k: 'buy', up: false }, { v: x.target, c: C.target, shape: 'tri', k: 'target', up: true },
    { v: x.trade, c: C.trade, shape: 'sq', k: 'trade', up: false }, { v: x.avgSell, c: C.sell, shape: 'dia', k: 'sell', up: true }]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="prod-ladder" role="img"
      aria-label={t('prod.ladderAria', { b: x.buy != null ? r(x.buy) : '—', s: x.avgSell != null ? r(x.avgSell) : '—', t: x.target != null ? r(x.target) : '—' })}>
      <rect x={L} y={Y - 5} width={Math.max(0, px(fl) - L)} height={10} rx={5} fill="#fecaca" />
      <rect x={px(fl)} y={Y - 5} width={Math.max(0, px(tg) - px(fl))} height={10} fill="#fde68a" />
      <rect x={px(tg)} y={Y - 5} width={Math.max(0, W - R - px(tg))} height={10} rx={5} fill="#bbf7d0" />
      {x.avgSell != null && x.buy != null && <line x1={px(x.buy)} x2={px(x.avgSell)} y1={Y} y2={Y} stroke={C.sell} strokeWidth={3} strokeLinecap="round" opacity={0.55} />}
      {marks.filter((m) => m.v != null).map((m) => (
        <g key={m.k}><Mark c={m.c} shape={m.shape} x={px(m.v!)} y={Y} s={m.k === 'sell' ? 7.5 : 6} />
          <text x={px(m.v!)} y={m.up ? 12 : H - 2} textAnchor="middle" fontSize={10} fill={m.c} fontWeight={700}>{r(m.v!).replace('₹', '₹')}</text></g>))}
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
