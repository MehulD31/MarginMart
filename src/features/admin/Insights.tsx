import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Copy, MapPin, MessageCircle, Phone, Search, Send, Sparkles, Store, TrendingUp, Users, Package } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { formatPaise } from '../../shared/money'
import { useInsights } from './useInsights'
import { factsForAI, type Alert, type Analysis, type ShopStat, type Segment } from '../../shared/insights.js'
import { Alert as Note, Empty, Sheet, Skeleton } from '../../shared/ui/kit'

const rs = (p: number) => formatPaise(Math.round(p / 100) * 100)          // whole rupees: easier to read
const short = (p: number) => (Math.abs(p) >= 1e7 ? `₹${(p / 1e7).toFixed(1)}L` : Math.abs(p) >= 1e5 ? `₹${(p / 1e5).toFixed(1)}k` : rs(p))
const waLink = (phone: string, text: string) => `https://wa.me/91${phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`

type Tab = 'call' | 'items' | 'shops' | 'areas'

/** Smart part of the dashboard: AI plan, alerts, trend + forecast, who to call, item / shop / area insights. */
export function Insights() {
  const { t } = useTranslation()
  const q = useInsights()
  const [tab, setTab] = useState<Tab>('call')
  const [shop, setShop] = useState<ShopStat | null>(null)
  if (q.isLoading) return <Skeleton rows={4} />
  if (q.isError || !q.data) return null
  const a = q.data
  if (!a.kpi.all.bills) return (
    <div className="card"><Empty icon={<Sparkles size={26} />} title={t('ins.emptyTitle')}><p>{t('ins.emptyHint')}</p></Empty></div>)
  return (
    <section className="stack-lg" aria-label={t('ins.title')}>
      <Advisor a={a} />
      <Kpis a={a} />
      <Alerts a={a} onShop={(name) => setShop(a.shops.find((s) => s.name === name) ?? null)} />
      <Trend a={a} />
      <div className="stack">
        <div className="segmented" role="tablist" aria-label={t('ins.title')}>
          {([['call', Phone, a.callToday.length], ['items', Package, a.sold.length], ['shops', Store, a.shops.length], ['areas', MapPin, a.prospects.length]] as const).map(([k, Icon, n]) => (
            <button key={k} type="button" role="tab" className="btn-sm" aria-selected={tab === k} onClick={() => setTab(k)}>
              <Icon size={16} aria-hidden="true" />{t(`ins.tab.${k}`)}{n ? <span className="tab-n">{n}</span> : null}</button>))}
        </div>
        {tab === 'call' && <CallList a={a} onShop={setShop} />}
        {tab === 'items' && <Items a={a} />}
        {tab === 'shops' && <Shops a={a} onShop={setShop} />}
        {tab === 'areas' && <Areas a={a} />}
      </div>
      <Sheet open={!!shop} wide title={shop ? `${shop.name}${shop.owner ? ` · ${shop.owner}` : ''}` : ''} onClose={() => setShop(null)}>
        {shop && <ShopCard s={shop} a={a} />}
      </Sheet>
    </section>
  )
}

// ---------------------------------------------------------------- AI advisor
/** Shown while Gemini works (10-30 s): what was asked, what the AI is doing, and a seconds counter. */
function Thinking({ q, bills }: { q: string; bills: number }) {
  const { t } = useTranslation()
  const [sec, setSec] = useState(0)
  useEffect(() => { const id = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(id) }, [])
  const steps = [t('ins.ai.step1', { n: bills }), t('ins.ai.step2'), t('ins.ai.step3')]
  return (
    <div className="ai-thinking" role="status" aria-live="polite" data-testid="ai-thinking">
      {q && <p className="cell-sub">“{q}”</p>}
      <div className="row" style={{ gap: 10 }}><span className="spinner" aria-hidden="true" /><strong>{steps[Math.min(steps.length - 1, Math.floor(sec / 5))]}</strong></div>
      <div className="bar"><i style={{ width: `${Math.min(95, sec * 3.5)}%` }} /></div>
      <p className="cell-sub num">{t('ins.ai.wait', { s: sec })}</p>
    </div>
  )
}

function Advisor({ a }: { a: Analysis }) {
  const { t, i18n } = useTranslation()
  const [question, setQuestion] = useState('')
  const cacheKey = `kd-ai-plan:${a.today}:${i18n.language}:${a.kpi.all.bills}`
  const [answer, setAnswer] = useState<{ q: string; text: string } | null>(() => {
    const c = localStorage.getItem(cacheKey); return c ? { q: '', text: c } : null
  })
  const run = useMutation({
    mutationFn: async (qq: string) => {
      const { data } = await supabase.auth.getSession()
      const r = await fetch('/api/insights-ai', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ facts: factsForAI(a), question: qq, lang: i18n.language }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.text) throw new Error(j.error ?? t('ins.ai.failed'))
      return { q: qq, text: String(j.text) }
    },
    onSuccess: (r) => { setAnswer(r); if (!r.q) localStorage.setItem(cacheKey, r.text) },
  })
  const ask = (qq: string) => { setQuestion(qq); run.mutate(qq) }
  const chips = ['ins.ai.q1', 'ins.ai.q2', 'ins.ai.q3', 'ins.ai.q4'] as const
  return (
    <div className="card stack ai-card" data-testid="ai-card">
      <div className="row-between">
        <h2 className="row"><Sparkles size={20} aria-hidden="true" />{t('ins.ai.title')}</h2>
        <button type="button" className="btn-sm primary" disabled={run.isPending} onClick={() => ask('')}>
          <Sparkles size={16} aria-hidden="true" />{run.isPending && !question ? t('ins.ai.thinking') : answer && !answer.q ? t('ins.ai.refresh') : t('ins.ai.plan')}</button>
      </div>
      {run.isPending ? <Thinking q={run.variables ?? ''} bills={a.kpi.all.bills} /> : answer ? (
        <div className="ai-answer" aria-live="polite" data-testid="ai-answer">
          {answer.q && <p className="cell-sub">“{answer.q}”</p>}
          {answer.text.split('\n').filter((l) => l.trim()).map((l, i) => <p key={i}>{l}</p>)}
        </div>
      ) : <p className="muted">{t('ins.ai.intro')}</p>}
      {run.isError && <Note msg={{ kind: 'error', text: (run.error as Error).message }} />}
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (question.trim()) ask(question.trim()) }}>
        <label className="field grow" style={{ margin: 0 }}><span className="sr-only">{t('ins.ai.ask')}</span>
          <input value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} placeholder={t('ins.ai.ask')} aria-label={t('ins.ai.ask')} /></label>
        <button type="submit" className="icon-btn" disabled={run.isPending || !question.trim()} aria-label={t('ins.ai.send')}><Send size={18} aria-hidden="true" /></button>
      </form>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {chips.map((c) => <button key={c} type="button" className="btn-sm chip-btn" disabled={run.isPending} onClick={() => ask(t(c))}>{t(c)}</button>)}
      </div>
      <p className="cell-sub">{a.spanDays < 14 ? t('ins.ai.early', { n: a.spanDays }) : t('ins.ai.basis', { n: a.kpi.all.bills })}</p>
    </div>
  )
}

// ---------------------------------------------------------------- KPIs
function Delta({ v }: { v: number | null }) {
  if (v == null) return null
  const up = v >= 0
  return <span className={`delta ${up ? 'up' : 'down'}`}>{up ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}{Math.abs(v)}%</span>
}
function Kpis({ a }: { a: Analysis }) {
  const { t } = useTranslation()
  const k = a.kpi
  const vsY = k.yesterday.value ? Math.round(((k.today.value - k.yesterday.value) / k.yesterday.value) * 100) : null
  const cards = [
    { label: t('ins.kpi.today'), value: rs(k.today.value), sub: t('ins.kpi.casesBills', { c: k.today.cases, b: k.today.bills }), delta: vsY, note: t('ins.kpi.vsYesterday') },
    { label: t('ins.kpi.week'), value: rs(k.last7.value), sub: t('ins.kpi.casesBills', { c: k.last7.cases, b: k.last7.bills }), delta: k.prev7.value ? k.change7.value : null, note: t('ins.kpi.vsLastWeek') },
    ...(a.admin ? [{ label: t('ins.kpi.margin'), value: rs(k.last7.margin ?? 0), sub: k.last7.cases ? t('ins.kpi.perCase', { v: rs((k.last7.margin ?? 0) / k.last7.cases) }) : '—', delta: null, note: '' }] : []),
    { label: t('ins.kpi.shops'), value: String(k.last7.shops), sub: t('ins.kpi.ofShops', { n: a.totalShops }), delta: k.prev7.shops ? k.change7.shops : null, note: '' },
    { label: t('ins.kpi.avgBill'), value: rs(k.last7.avgBill || k.all.avgBill), sub: t('ins.kpi.allTime', { v: rs(k.all.value), b: k.all.bills }), delta: null, note: '' },
  ]
  return (
    <div className="stats ins-kpis">{cards.map((c) => (
      <div key={c.label} className="stat" data-testid="ins-kpi">
        <div className="label">{c.label}</div>
        <div className="value num">{c.value} <Delta v={c.delta} /></div>
        <div className="cell-sub">{c.sub}{c.delta != null && c.note ? ` · ${c.note}` : ''}</div>
      </div>))}
    </div>
  )
}

// ---------------------------------------------------------------- alerts
function alertText(t: ReturnType<typeof useTranslation>['t'], x: Alert, admin: boolean) {
  switch (x.kind) {
    case 'runOut': return t('ins.alert.runOut', { item: x.item, d: x.days, n: x.onHand, r: x.reorder })
    case 'negative': return t('ins.alert.negative', { item: x.item, n: x.onHand })
    case 'lateShop': return t('ins.alert.lateShop', { shop: x.shop, d: x.days, g: x.gap })
    case 'itemDown': return t('ins.alert.itemDown', { item: x.item, p: Math.abs(Number(x.pct)) })
    case 'loss': return admin ? t('ins.alert.loss', { item: x.item, v: rs(Number(x.perCase)) }) : null
    case 'salesDown': return t('ins.alert.salesDown', { p: Math.abs(Number(x.pct)) })
    case 'salesUp': return t('ins.alert.salesUp', { p: x.pct })
    case 'dues': return t('ins.alert.dues', { n: x.n, v: rs(Number(x.amount)) })
    case 'deadStock': return t('ins.alert.deadStock', { n: x.n, c: x.cases, top: (x.top as string[]).join(', ') })
    default: return null
  }
}
function Alerts({ a, onShop }: { a: Analysis; onShop: (name: string) => void }) {
  const { t } = useTranslation()
  const rows = a.alerts.map((x) => ({ x, text: alertText(t, x, a.admin) })).filter((r) => r.text)
  if (!rows.length) return <Note msg={{ kind: 'success', text: t('ins.alert.none') }} />
  return (
    <div className="card stack">
      <h2 className="row"><AlertTriangle size={20} aria-hidden="true" />{t('ins.alert.title')}</h2>
      <ul className="plain-list stack" style={{ gap: 8 }}>{rows.map(({ x, text }, i) => (
        <li key={i} className={`ins-alert ins-${x.level}`} data-testid="ins-alert">
          <span className="grow">{text}</span>
          {x.kind === 'lateShop' && <button type="button" className="btn-sm" onClick={() => onShop(String(x.shop))}>{t('ins.open')}</button>}
          {(x.kind === 'runOut' || x.kind === 'negative') && <Link to="/admin/purchases" className="button btn-sm">{t('ins.buy')}</Link>}
          {x.kind === 'dues' && <Link to="/admin/khata" className="button btn-sm">{t('nav.khata')}</Link>}
        </li>))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------- trend + forecast
function Trend({ a }: { a: Analysis }) {
  const { t, i18n } = useTranslation()
  const [metric, setMetric] = useState<'cases' | 'value'>('cases')
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'
  const days = a.daily.slice(-Math.max(14, Math.min(30, a.spanDays + 7)))
  const fc = metric === 'cases' ? a.forecast : []
  const all = [...days.map((d) => d[metric]), ...fc.map((f) => f.cases)]
  const max = Math.max(1, ...all)
  const W = 100 / (days.length + fc.length)
  const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(loc, { day: 'numeric', month: 'short' })
  const bestDow = [...a.weekday].sort((x, y) => y.cases - x.cases)[0]
  return (
    <div className="card stack">
      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <h2 className="row"><TrendingUp size={20} aria-hidden="true" />{t('ins.trend.title')}</h2>
        <div className="segmented" role="tablist" aria-label={t('ins.trend.title')}>
          <button type="button" role="tab" className="btn-sm" aria-selected={metric === 'cases'} onClick={() => setMetric('cases')}>{t('ins.trend.cases')}</button>
          <button type="button" role="tab" className="btn-sm" aria-selected={metric === 'value'} onClick={() => setMetric('value')}>{t('ins.trend.value')}</button>
        </div>
      </div>
      <svg className="ins-chart" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={t('ins.trend.aria')}>
        {days.map((d, i) => { const h = (d[metric] / max) * 36; return (
          <rect key={d.day} x={i * W + W * 0.15} y={38 - h} width={W * 0.7} height={Math.max(h, d[metric] ? 0.8 : 0.3)} rx={0.6}
            className={d.day === a.today ? 'bar-today' : 'bar-past'}><title>{`${dayLabel(d.day)}: ${metric === 'cases' ? `${d.cases} ${t('ins.trend.cases')}` : rs(d.value)} · ${d.bills} ${t('ins.trend.bills')}`}</title></rect>) })}
        {fc.map((f, i) => { const h = (f.cases / max) * 36; return (
          <rect key={f.day} x={(days.length + i) * W + W * 0.15} y={38 - h} width={W * 0.7} height={Math.max(h, 0.3)} rx={0.6} className="bar-fc">
            <title>{`${dayLabel(f.day)}: ~${f.cases} ${t('ins.trend.cases')} (${t('ins.trend.forecast')})`}</title></rect>) })}
      </svg>
      <div className="row-between cell-sub"><span>{dayLabel(days[0].day)}</span><span>{t('ins.trend.today')}</span>{fc.length > 0 && <span>{t('ins.trend.next7', { n: fc.reduce((s, f) => s + f.cases, 0) })}</span>}</div>
      <p className="cell-sub">{a.spanDays >= 14 && bestDow?.cases ? t('ins.trend.bestDay', { d: t(`days.${bestDow.dow === 0 ? 7 : bestDow.dow}`), n: Math.round(bestDow.cases) }) : t('ins.trend.fcNote')}</p>
    </div>
  )
}

// ---------------------------------------------------------------- call list
const SEG_TONE: Record<Segment, string> = { champion: 'badge-green', loyal: 'badge-blue', new: 'badge-blue', oneTime: '', atRisk: 'badge-amber', lost: 'badge-red' }
function waOrderText(t: ReturnType<typeof useTranslation>['t'], s: ShopStat) {
  const usual = s.likely.slice(0, 3).map((l) => `${l.label} ${l.qty}`).join(', ')
  const rec = s.recommend[0]?.label
  return t('ins.call.wa', { owner: s.owner ?? s.name, usual, rec: rec ? t('ins.call.waRec', { item: rec }) : '' })
}
function ShopActions({ s }: { s: ShopStat }) {
  const { t } = useTranslation()
  if (!s.phone) return null
  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <a className="button btn-sm primary" href={`tel:+91${s.phone}`}><Phone size={16} aria-hidden="true" />{t('shops.call')}</a>
      <a className="button btn-sm whatsapp" href={waLink(s.phone, waOrderText(t, s))} target="_blank" rel="noreferrer"><MessageCircle size={16} aria-hidden="true" />WhatsApp</a>
    </div>
  )
}
function CallList({ a, onShop }: { a: Analysis; onShop: (s: ShopStat) => void }) {
  const { t } = useTranslation()
  const list = [...a.callToday, ...a.dueSoon]
  if (!list.length) return <div className="card"><Empty icon={<Phone size={24} />} title={t('ins.call.none')}><p>{a.spanDays < 7 ? t('ins.call.early') : t('ins.call.noneHint')}</p></Empty></div>
  return (
    <ul className="plain-list ins-grid">{list.map((s) => (
      <li key={s.id} className="card stack" data-testid="call-card">
        <button type="button" className="ghost ins-shop-head" onClick={() => onShop(s)}>
          <span className="grow" style={{ textAlign: 'left' }}><span className="cell-title">{s.name}</span>{s.owner && <span className="muted"> · {s.owner}</span>}
            <span className="cell-sub" style={{ display: 'block' }}>{[s.area, s.phone].filter(Boolean).join(' · ')}</span></span>
          <span className={`badge ${s.lateBy != null && s.lateBy > 0 ? 'badge-amber' : 'badge-blue'}`}>
            {s.gap ? (s.lateBy! > 0 ? t('ins.call.late', { n: s.lateBy }) : s.lateBy === 0 ? t('ins.call.dueToday') : t('ins.call.dueIn', { n: -s.lateBy! })) : t('ins.call.repeat')}</span>
        </button>
        <p className="cell-sub">{s.gap ? t('ins.call.rhythm', { g: Math.round(s.gap), d: s.since, v: rs(s.avgBill) }) : t('ins.call.once', { d: s.since, v: rs(s.avgBill) })}</p>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {s.likely.slice(0, 3).map((l) => <span key={l.item} className="badge badge-green">{l.label} × {l.qty}</span>)}
          {s.recommend.slice(0, 1).map((r) => <span key={r.item} className="badge badge-blue">✨ {t('ins.call.try', { item: r.label })}</span>)}
        </div>
        <ShopActions s={s} />
      </li>))}
    </ul>
  )
}

// ---------------------------------------------------------------- items
function Items({ a }: { a: Analysis }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const order = a.sold.filter((i) => i.reorder > 0)
  const max = a.sold[0]?.cases ?? 1
  const copy = async () => {
    const text = `${t('ins.items.pepsiHead', { d: a.today })}\n${order.map((i) => `• ${i.label}: ${i.reorder}`).join('\n')}\n${t('ins.items.total', { n: order.reduce((s, i) => s + i.reorder, 0) })}`
    await navigator.clipboard?.writeText(text).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2500)
  }
  return (
    <div className="stack-lg">
      <div className="card card-flush">
        <div className="table-wrap"><table className="table-stack" aria-label={t('ins.items.title')}>
          <thead><tr><th scope="col">{t('ins.items.item')}</th><th scope="col">{t('ins.items.sold')}</th><th scope="col">{t('ins.items.shops')}</th>
            <th scope="col">{t('ins.items.stock')}</th>{a.admin && <th scope="col">{t('ins.items.margin')}</th>}</tr></thead>
          <tbody>{a.sold.map((i) => (
            <tr key={i.id} data-testid="item-row">
              <td className="lead"><div className="cell-title">{i.label}</div>
                {i.topBuyers.length > 0 && <div className="cell-sub" data-testid="top-buyers">{t('ins.items.topBuyers', { list: i.topBuyers.slice(0, 3).map((b) => `${b.name} ${b.cases}`).join(', ') })}</div>}
                <div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${(i.cases / max) * 100}%` }} /></div></td>
              <td data-label={t('ins.items.sold')} className="num"><strong>{i.cases}</strong> <span className="cell-sub">({rs(i.value)})</span> <Delta v={i.trend} /></td>
              <td data-label={t('ins.items.shops')} className="num">{i.shops}</td>
              <td data-label={t('ins.items.stock')} className="num">{i.onHand}{' '}
                {i.coverDays != null && <span className={`badge ${i.coverDays <= 3 ? 'badge-red' : i.coverDays <= 7 ? 'badge-amber' : 'badge-green'}`}>{t('ins.items.days', { n: i.coverDays })}</span>}</td>
              {a.admin && <td data-label={t('ins.items.margin')} className={`num ${(i.marginPerCase ?? 0) < 0 ? 'text-danger' : ''}`}>{i.marginPerCase != null ? rs(i.marginPerCase) : '—'}</td>}
            </tr>))}</tbody>
        </table></div>
      </div>
      {order.length > 0 && (
        <div className="card stack">
          <div className="row-between"><h2>{t('ins.items.orderTitle')}</h2>
            <button type="button" className="btn-sm" onClick={() => void copy()}><Copy size={16} aria-hidden="true" />{copied ? t('ins.items.copied') : t('ins.items.copy')}</button></div>
          <p className="cell-sub">{t('ins.items.orderHint')}</p>
          <ul className="plain-list cell-sub">{order.map((i) => <li key={i.id}>{i.label}: <strong>{i.reorder}</strong> ({t('ins.items.perDay', { n: i.perDay })})</li>)}</ul>
        </div>)}
      {a.pairs.length > 0 && (
        <div className="card stack">
          <h2>{t('ins.items.together')}</h2>
          <ul className="plain-list cell-sub">{a.pairs.slice(0, 5).map((p) => <li key={p.a + p.b}>{p.aLabel} + {p.bLabel} · {t('ins.items.pairShops', { n: p.shops })}</li>)}</ul>
          <p className="cell-sub">{t('ins.items.togetherHint')}</p>
        </div>)}
      {a.deadStock.length > 0 && (
        <div className="card stack">
          <h2>{t('ins.items.dead', { n: a.deadStock.length })}</h2>
          <p className="cell-sub">{t('ins.items.deadHint')}</p>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{a.deadStock.slice(0, 15).map((i) => <span key={i.id} className="badge">{i.label}: {i.onHand}</span>)}</div>
        </div>)}
    </div>
  )
}

// ---------------------------------------------------------------- shops
function Shops({ a, onShop }: { a: Analysis; onShop: (s: ShopStat) => void }) {
  const { t } = useTranslation()
  const [seg, setSeg] = useState<Segment | ''>('')
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  const list = a.shops.filter((s) => (!seg || s.segment === seg) && (!ql || `${s.name} ${s.owner ?? ''} ${s.area ?? ''} ${s.phone ?? ''}`.toLowerCase().includes(ql)))
  const max = a.shops[0]?.value ?? 1
  return (
    <div className="stack">
      <p className="cell-sub"><Users size={14} aria-hidden="true" /> {t('ins.shops.concentration', { p: a.concentration })}</p>
      <div className="segmented" role="tablist" aria-label={t('ins.shops.segments')}>
        <button type="button" role="tab" className="btn-sm" aria-selected={!seg} onClick={() => setSeg('')}>{t('ins.shops.all', { n: a.shops.length })}</button>
        {a.segments.filter((x) => x.shops.length).map((x) => (
          <button key={x.key} type="button" role="tab" className="btn-sm" aria-selected={seg === x.key} onClick={() => setSeg(x.key)}>{t(`ins.seg.${x.key}`)} ({x.shops.length})</button>))}
      </div>
      <label className="field search-field"><Search size={18} aria-hidden="true" /><span className="sr-only">{t('ins.shops.search')}</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ins.shops.search')} aria-label={t('ins.shops.search')} /></label>
      {seg && <p className="cell-sub">{t(`ins.segHint.${seg}`)}</p>}
      <ul className="plain-list stack" style={{ gap: 8 }}>{list.map((s, i) => (
        <li key={s.id}><button type="button" className="card ins-shop-row" onClick={() => onShop(s)} data-testid="shop-row">
          <span className="ins-rank">{i + 1}</span>
          <span className="grow" style={{ textAlign: 'left' }}>
            <span className="cell-title">{s.name}</span>{s.owner && <span className="muted"> · {s.owner}</span>}
            <span className="cell-sub" style={{ display: 'block' }}>{t('ins.shops.line', { b: s.bills, c: s.cases, d: s.since })}{s.gap ? ` · ${t('ins.shops.every', { n: Math.round(s.gap) })}` : ''}</span>
            <span className="bar" style={{ display: 'block', marginTop: 6 }}><i style={{ width: `${(s.value / max) * 100}%` }} /></span>
          </span>
          <span style={{ textAlign: 'right' }}><strong className="num">{short(s.value)}</strong><br /><span className={`badge ${SEG_TONE[s.segment]}`}>{t(`ins.seg.${s.segment}`)}</span></span>
        </button></li>))}
        {!list.length && <li className="muted">{t('common.noMatches')}</li>}
      </ul>
    </div>
  )
}

function ShopCard({ s, a }: { s: ShopStat; a: Analysis }) {
  const { t, i18n } = useTranslation()
  const share = a.kpi.all.value ? Math.round((s.value / a.kpi.all.value) * 100) : 0
  return (
    <div className="stack-lg" data-testid="shop-card">
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className={`badge ${SEG_TONE[s.segment]}`}>{t(`ins.seg.${s.segment}`)}</span>
        {s.area && <span className="badge">{s.area}</span>}{s.route && <span className="badge">{s.route}</span>}
      </div>
      <div className="stats">
        <div className="stat"><div className="label">{t('ins.shop.bought')}</div><div className="value num">{short(s.value)}</div><div className="cell-sub">{t('ins.shop.share', { p: share })}</div></div>
        <div className="stat"><div className="label">{t('ins.shop.cases')}</div><div className="value num">{s.cases}</div><div className="cell-sub">{t('ins.shop.bills', { n: s.bills })}</div></div>
        <div className="stat"><div className="label">{t('ins.shop.rhythm')}</div><div className="value num">{s.gap ? t('ins.shops.every', { n: Math.round(s.gap) }) : '—'}</div><div className="cell-sub">{s.since === 0 ? t('ins.shop.lastToday') : t('ins.shop.last', { d: s.since })}</div></div>
        {a.admin && <div className="stat"><div className="label">{t('ins.shop.margin')}</div><div className="value num">{rs(s.margin ?? 0)}</div><div className="cell-sub">{s.cases ? t('ins.kpi.perCase', { v: rs((s.margin ?? 0) / s.cases) }) : ''}</div></div>}
      </div>
      {s.nextDue && <Note msg={{ kind: s.lateBy! > 0 ? 'warn' : 'success', text: s.lateBy! > 0 ? t('ins.shop.late', { d: s.lateBy, v: rs(s.likelyValue) }) : t('ins.shop.next', { date: new Date(`${s.nextDue}T00:00:00`).toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short' }), v: rs(s.likelyValue) }) }} />}
      {s.overdue > 0 && <Note msg={{ kind: 'error', text: t('ins.shop.dues', { v: rs(s.overdue), b: rs(s.balance) }) }} />}
      <div className="stack"><h3>{t('ins.shop.usual')}</h3>
        <ul className="plain-list">{s.likely.map((l) => <li key={l.item} className="row-between cart-line"><span>{l.label}</span><span className="num cell-sub">{t('ins.shop.usualQty', { q: l.qty, n: l.times })}</span></li>)}</ul></div>
      {s.recommend.length > 0 && <div className="stack"><h3>✨ {t('ins.shop.recommend')}</h3>
        <ul className="plain-list cell-sub">{s.recommend.map((r) => <li key={r.item}>{r.label} <span className="muted">· {t('ins.shop.inStock', { n: r.onHand })}</span></li>)}</ul>
        <p className="cell-sub">{t('ins.shop.recommendHint')}</p></div>}
      <ShopActions s={s} />
    </div>
  )
}

// ---------------------------------------------------------------- areas + growth
function Areas({ a }: { a: Analysis }) {
  const { t } = useTranslation()
  const rows = useMemo(() => a.areas.filter((x) => x.total >= 3 || x.value > 0).slice(0, 15), [a.areas])
  return (
    <div className="stack-lg">
      <Note msg={{ kind: 'warn', text: t('ins.areas.reach', { b: a.buyers, n: a.totalShops, p: a.totalShops ? Math.round((a.buyers / a.totalShops) * 100) : 0 }) }} />
      <div className="card card-flush"><div className="table-wrap"><table className="table-stack" aria-label={t('ins.areas.title')}>
        <thead><tr><th scope="col">{t('ins.areas.area')}</th><th scope="col">{t('ins.areas.buying')}</th><th scope="col">{t('ins.areas.sales')}</th></tr></thead>
        <tbody>{rows.map((x) => (
          <tr key={x.area}><td className="lead"><div className="cell-title">{x.area}</div>
            <div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${Math.max(2, x.reach)}%` }} /></div></td>
            <td data-label={t('ins.areas.buying')} className="num">{x.buyers} / {x.total} <span className="cell-sub">({x.reach}%)</span></td>
            <td data-label={t('ins.areas.sales')} className="num">{x.value ? rs(x.value) : '—'}</td></tr>))}</tbody>
      </table></div></div>
      <div className="stack">
        <h2>{t('ins.areas.prospects', { n: a.prospects.length })}</h2>
        <p className="cell-sub">{t('ins.areas.prospectsHint')}</p>
        <ul className="plain-list ins-grid">{a.prospects.slice(0, 12).map((p) => (
          <li key={p.id} className="card stack" data-testid="prospect">
            <div><div className="cell-title">{p.name}{p.owner ? <span className="muted"> · {p.owner}</span> : null}</div><div className="cell-sub">{[p.area, p.route].filter(Boolean).join(' · ')}</div></div>
            {p.phone && <div className="row" style={{ gap: 8 }}>
              <a className="button btn-sm" href={`tel:+91${p.phone}`}><Phone size={16} aria-hidden="true" />{t('shops.call')}</a>
              <a className="button btn-sm whatsapp" href={waLink(p.phone, t('ins.areas.wa', { owner: p.owner ?? p.name, area: p.area ?? '' }))} target="_blank" rel="noreferrer"><MessageCircle size={16} aria-hidden="true" />WhatsApp</a></div>}
          </li>))}</ul>
      </div>
    </div>
  )
}
