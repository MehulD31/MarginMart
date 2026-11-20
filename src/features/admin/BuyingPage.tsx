import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Package, Store, TrendingUp } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { formatPaise as fmtPaise } from '../../shared/money'
import { casesNum } from '../../shared/cases'
import { useRemembered } from '../../shared/ui/draft'
import { Empty, PageHeader, Sheet, Skeleton } from '../../shared/ui/kit'
import { Pager } from '../../shared/ui/Pager'
import { usePaged } from '../../shared/ui/paging'
import { todayIST } from './opsData'

// "Who buys what" (owner, 19 Nov 2026): per shop which items it buys most and at what rate, and per item which shops buy the most.
// Rates are per case, after discount. Source: every sale (counter, truck, route). Open to admin and manager.
interface Row { shop_id: string; variant_id: string; shop: string; locality: string | null; item: string; cases: number; value: number; bills: number; min_rate: number; max_rate: number; last_rate: number; last_at: string }
interface Bill { at: string; src: string; bill: string | null; total: number; lines: { item: string; qty: number; rate: number }[] }
type View = 'shop' | 'item'
type Span = '30' | '90' | '365' | 'all'

// whole rupees only: rates are per case, paise would only add noise
const formatPaise = (p: number) => fmtPaise(Math.round(p / 100) * 100)
const shiftDay = (n: number) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const dayShort = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const range = (r: number, rr: number) => (r === rr ? formatPaise(r) : `${formatPaise(r)} – ${formatPaise(rr)}`)

function useRows(span: Span) {
  const from = span === 'all' ? '2020-01-01' : shiftDay(-Number(span)), to = todayIST()
  return useQuery({ queryKey: ['shop-item-sales', from, to], queryFn: () => must<Row[]>(supabase.rpc('shop_item_sales', { p_from: from, p_to: to })), staleTime: 60_000 })
}

const ROW_BTN = { width: '100%', height: 'auto', minHeight: 0, textAlign: 'left', padding: '12px 16px', background: 'none', border: 0, borderRadius: 0, boxShadow: 'none', display: 'block', whiteSpace: 'normal', fontWeight: 400, lineHeight: 1.35 } as const
function Bar({ pct }: { pct: number }) {
  return <div className="bar" role="presentation" style={{ marginTop: 6 }}><i style={{ width: `${Math.max(3, Math.round(pct))}%` }} /></div>
}

export default function BuyingPage() {
  const { t } = useTranslation()
  const [view, setView] = useRemembered<View>('view:buying:view', 'shop')
  const [span, setSpan] = useRemembered<Span>('view:buying:span', '30')
  const [q, setQ] = useRemembered('view:buying:q', '')
  const [shopId, setShopId] = useState<string | null>(null)
  const [itemId, setItemId] = useState<string | null>(null)
  const data = useRows(span)
  const rows = useMemo(() => data.data ?? [], [data.data])

  const shops = useMemo(() => {
    const m = new Map<string, { id: string; name: string; locality: string | null; cases: number; value: number; items: number; last: string; top: Row }>()
    for (const r of rows) {
      const s = m.get(r.shop_id) ?? { id: r.shop_id, name: r.shop, locality: r.locality, cases: 0, value: 0, items: 0, last: r.last_at, top: r }
      s.cases += r.cases; s.value += r.value; s.items += 1
      if (r.last_at > s.last) s.last = r.last_at
      if (r.cases > s.top.cases) s.top = r
      m.set(r.shop_id, s)
    }
    return [...m.values()].sort((a, b) => b.value - a.value)
  }, [rows])
  const items = useMemo(() => {
    const m = new Map<string, { id: string; name: string; cases: number; value: number; shops: number; min: number; max: number; topShop: Row }>()
    for (const r of rows) {
      const i = m.get(r.variant_id) ?? { id: r.variant_id, name: r.item, cases: 0, value: 0, shops: 0, min: r.min_rate, max: r.max_rate, topShop: r }
      i.cases += r.cases; i.value += r.value; i.shops += 1; i.min = Math.min(i.min, r.min_rate); i.max = Math.max(i.max, r.max_rate)
      if (r.cases > i.topShop.cases) i.topShop = r
      m.set(r.variant_id, i)
    }
    return [...m.values()].sort((a, b) => b.cases - a.cases)
  }, [rows])

  const ql = q.trim().toLowerCase()
  const shopList = shops.filter((s) => !ql || `${s.name} ${s.locality ?? ''}`.toLowerCase().includes(ql))
  const itemList = items.filter((i) => !ql || i.name.toLowerCase().includes(ql))
  const list = view === 'shop' ? shopList : itemList
  const pg = usePaged(list as { id: string }[], 20)
  const maxShop = shops[0]?.value || 1, maxItem = items[0]?.cases || 1
  const total = shops.reduce((a, s) => a + s.value, 0), totalCases = shops.reduce((a, s) => a + s.cases, 0)

  return (
    <section className="stack-lg">
      <PageHeader title={t('buy.title')} sub={t('buy.sub')} />
      <div className="segmented" role="tablist" aria-label={t('buy.title')} style={{ flexWrap: 'wrap' }}>
        <button type="button" role="tab" className="btn-sm" aria-selected={view === 'shop'} onClick={() => setView('shop')}><Store size={16} aria-hidden="true" /> {t('buy.byShop')}</button>
        <button type="button" role="tab" className="btn-sm" aria-selected={view === 'item'} onClick={() => setView('item')}><Package size={16} aria-hidden="true" /> {t('buy.byItem')}</button>
      </div>
      <div className="segmented" role="tablist" aria-label={t('buy.period')} style={{ flexWrap: 'wrap' }}>
        {(['30', '90', '365', 'all'] as const).map((s) => <button key={s} type="button" role="tab" className="btn-sm" aria-selected={span === s} onClick={() => setSpan(s)}>{t(`buy.span.${s}`)}</button>)}
      </div>
      <div className="stats">
        <div className="stat"><div className="label">{t('buy.sold')}</div><div className="value num">{formatPaise(total)}</div></div>
        <div className="stat"><div className="label">{t('buy.cases')}</div><div className="value num">{casesNum(totalCases)}</div></div>
        <div className="stat"><div className="label">{view === 'shop' ? t('buy.shops') : t('buy.items')}</div><div className="value num">{view === 'shop' ? shops.length : items.length}</div></div>
      </div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('buy.search')} placeholder={view === 'shop' ? t('buy.searchShop') : t('buy.searchItem')} style={{ maxWidth: 420 }} />
      {data.isLoading ? <Skeleton rows={5} /> : list.length === 0 ? <div className="card"><Empty icon={<TrendingUp size={26} />} title={t('buy.none')} /></div> : (
        <div className="card card-flush"><ul className="plain-list" data-testid="buy-list">
          {view === 'shop' ? (pg.rows as typeof shopList).map((s, n) => (
            <li key={s.id}>
              <button type="button" className="row-btn" style={ROW_BTN} data-testid="buy-shop" onClick={() => setShopId(s.id)}>
                <div className="row-between" style={{ gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}><div className="cell-title" style={{ overflowWrap: 'anywhere' }}>{(pg.page - 1) * 20 + n + 1}. {s.name}</div>
                    <div className="cell-sub">{s.locality ? `${s.locality} · ` : ''}{t('buy.topItem', { item: s.top.item, n: casesNum(s.top.cases) })}</div>
                    <div className="cell-sub">{t('buy.lastBought', { d: dayShort(s.last) })}</div></div>
                  <div style={{ textAlign: 'right' }}><strong className="num">{formatPaise(s.value)}</strong><div className="cell-sub num">{t('buy.casesN', { n: casesNum(s.cases) })}</div></div>
                </div>
                <Bar pct={(s.value / maxShop) * 100} />
              </button>
            </li>)) : (pg.rows as typeof itemList).map((i, n) => (
            <li key={i.id}>
              <button type="button" className="row-btn" style={ROW_BTN} data-testid="buy-item" onClick={() => setItemId(i.id)}>
                <div className="row-between" style={{ gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}><div className="cell-title" style={{ overflowWrap: 'anywhere' }}>{(pg.page - 1) * 20 + n + 1}. {i.name}</div>
                    <div className="cell-sub">{t('buy.shopsN', { n: i.shops })} · {t('buy.rate')} {range(i.min, i.max)}</div>
                    <div className="cell-sub">{t('buy.topShop', { shop: i.topShop.shop, n: casesNum(i.topShop.cases) })}</div></div>
                  <div style={{ textAlign: 'right' }}><strong className="num">{t('buy.casesN', { n: casesNum(i.cases) })}</strong><div className="cell-sub num">{formatPaise(i.value)}</div></div>
                </div>
                <Bar pct={(i.cases / maxItem) * 100} />
              </button>
            </li>))}
        </ul><Pager p={pg} /></div>)}
      <Sheet open={!!shopId} wide title={shops.find((s) => s.id === shopId)?.name} onClose={() => setShopId(null)}>
        {shopId && <ShopDetail rows={rows.filter((r) => r.shop_id === shopId)} shopId={shopId} span={span} />}
      </Sheet>
      <Sheet open={!!itemId} wide title={items.find((i) => i.id === itemId)?.name} onClose={() => setItemId(null)}>
        {itemId && <ItemDetail rows={rows.filter((r) => r.variant_id === itemId)} />}
      </Sheet>
    </section>
  )
}

function ShopDetail({ rows, shopId, span }: { rows: Row[]; shopId: string; span: Span }) {
  const { t } = useTranslation()
  const from = span === 'all' ? '2020-01-01' : shiftDay(-Number(span)), to = todayIST()
  const hist = useQuery({ queryKey: ['shop-item-history', shopId, from, to], queryFn: () => must<Bill[]>(supabase.rpc('shop_item_history', { p_shop: shopId, p_from: from, p_to: to })) })
  const sorted = [...rows].sort((a, b) => b.cases - a.cases)
  const max = sorted[0]?.cases || 1
  const value = rows.reduce((a, r) => a + r.value, 0), cases = rows.reduce((a, r) => a + r.cases, 0)
  return (
    <div className="stack-lg" data-testid="buy-shop-detail">
      <div className="stats">
        <div className="stat"><div className="label">{t('buy.bought')}</div><div className="value num">{formatPaise(value)}</div></div>
        <div className="stat"><div className="label">{t('buy.cases')}</div><div className="value num">{casesNum(cases)}</div></div>
        <div className="stat"><div className="label">{t('buy.items')}</div><div className="value num">{rows.length}</div></div>
      </div>
      <h2>{t('buy.itemsBought')}</h2>
      <div className="card card-flush"><ul className="plain-list">{sorted.map((r) => (
        <li key={r.variant_id} style={{ padding: '10px 16px' }}>
          <div className="row-between" style={{ gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}><div className="cell-title" style={{ overflowWrap: 'anywhere' }}>{r.item}</div>
              <div className="cell-sub num">{t('buy.avgRate', { r: formatPaise(Math.round(r.value / r.cases)) })} · {t('buy.lastRate', { r: formatPaise(r.last_rate) })}</div>
              {r.min_rate !== r.max_rate && <div className="cell-sub num">{t('buy.rateRange', { r: range(r.min_rate, r.max_rate) })}</div>}
              <div className="cell-sub">{t('buy.times', { n: r.bills })} · {t('buy.lastBought', { d: dayShort(r.last_at) })}</div></div>
            <div style={{ textAlign: 'right' }}><strong className="num">{t('buy.casesN', { n: casesNum(r.cases) })}</strong><div className="cell-sub num">{formatPaise(r.value)}</div></div>
          </div>
          <Bar pct={(r.cases / max) * 100} />
        </li>))}</ul></div>
      <h2>{t('buy.recentBills')}</h2>
      {hist.isLoading ? <Skeleton rows={3} /> : !hist.data?.length ? <p className="muted">{t('buy.none')}</p> : (
        <ul className="plain-list stack">{hist.data.map((b) => (
          <li key={(b.bill ?? '') + b.at} className="card stack" style={{ gap: 4 }}>
            <div className="row-between"><strong>{b.bill ?? t('buy.routeBill')} · {dayShort(b.at)}</strong><strong className="num">{formatPaise(b.total)}</strong></div>
            {b.lines.map((l, i) => <div key={i} className="cell-sub row-between"><span style={{ overflowWrap: 'anywhere' }}>{l.item} × {casesNum(l.qty)}</span><span className="num">{formatPaise(l.rate)}</span></div>)}
          </li>))}</ul>)}
    </div>
  )
}

function ItemDetail({ rows }: { rows: Row[] }) {
  const { t } = useTranslation()
  const sorted = [...rows].sort((a, b) => b.cases - a.cases)
  const max = sorted[0]?.cases || 1
  const cases = rows.reduce((a, r) => a + r.cases, 0), value = rows.reduce((a, r) => a + r.value, 0)
  return (
    <div className="stack-lg" data-testid="buy-item-detail">
      <div className="stats">
        <div className="stat"><div className="label">{t('buy.cases')}</div><div className="value num">{casesNum(cases)}</div></div>
        <div className="stat"><div className="label">{t('buy.avgRateLabel')}</div><div className="value num">{formatPaise(cases ? Math.round(value / cases) : 0)}</div></div>
        <div className="stat"><div className="label">{t('buy.shops')}</div><div className="value num">{rows.length}</div></div>
      </div>
      <h2>{t('buy.whoBuys')}</h2>
      <div className="card card-flush"><ul className="plain-list">{sorted.map((r) => (
        <li key={r.shop_id} style={{ padding: '10px 16px' }}>
          <div className="row-between" style={{ gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}><div className="cell-title" style={{ overflowWrap: 'anywhere' }}>{r.shop}</div>
              <div className="cell-sub num">{t('buy.avgRate', { r: formatPaise(Math.round(r.value / r.cases)) })} · {t('buy.lastRate', { r: formatPaise(r.last_rate) })}</div>
              {r.min_rate !== r.max_rate && <div className="cell-sub num">{t('buy.rateRange', { r: range(r.min_rate, r.max_rate) })}</div>}
              <div className="cell-sub">{t('buy.times', { n: r.bills })} · {t('buy.lastBought', { d: dayShort(r.last_at) })}</div></div>
            <div style={{ textAlign: 'right' }}><strong className="num">{t('buy.casesN', { n: casesNum(r.cases) })}</strong><div className="cell-sub num">{formatPaise(r.value)}</div></div>
          </div>
          <Bar pct={(r.cases / max) * 100} />
        </li>))}</ul></div>
    </div>
  )
}
