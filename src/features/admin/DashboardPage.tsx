import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Scale, Wallet, CircleCheck, Circle, ClipboardList, IndianRupee, Package, Phone, Store, Truck, TrendingUp } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must, usePacks, useVariants, useVehicles, type Shop } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise } from '../../shared/money'
import { Empty, Skeleton } from '../../shared/ui/kit'
import { ProductImage } from '../../shared/ui/ProductImage'
import { initials } from '../../shared/ui/util'
import { isLive, linesCases, linesTotal, planDates, useLocaleDate, useOrdersFor, usePlans } from './opsData'

const useSetup = () => useQuery({
  queryKey: ['setup-status'],
  queryFn: async () => {
    const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0
    const [shops, live, drivers, photos, flavours] = await Promise.all([
      count(supabase.from('shop').select('id', { count: 'exact', head: true }).eq('active', true)),
      count(supabase.from('price_list').select('id', { count: 'exact', head: true }).eq('status', 'active')),
      count(supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'driver').eq('active', true)),
      count(supabase.from('variant').select('id', { count: 'exact', head: true }).eq('active', true).not('image_path', 'is', null)),
      count(supabase.from('variant').select('id', { count: 'exact', head: true }).eq('active', true)),
    ])
    return { shops, live, drivers, photos, flavours }
  },
})

type Handover = { expected_cash_paise: number; handed_cash_paise: number; stock_diff: unknown[]; received_at: string | null }

/** Money at a glance: today's payments (IST), what shops owe, overdue shops and closings with differences. */
const useMoney = () => useQuery({
  queryKey: ['dash-money'],
  queryFn: async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const since = new Date(`${today}T00:00:00+05:30`).toISOString()
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const [pays, bal, hand] = await Promise.all([
      must<{ amount_paise: number; payment_mode: string }[]>(supabase.from('ledger_entry').select('amount_paise, payment_mode').eq('type', 'payment').gte('created_at', since)),
      must<{ balance_paise: number; overdue_paise: number }[]>(supabase.from('v_shop_balance').select('balance_paise, overdue_paise').gt('balance_paise', 0)),
      must<Handover[]>(supabase.from('cash_handover').select('expected_cash_paise, handed_cash_paise, stock_diff, received_at').gte('closed_at', weekAgo)),
    ])
    const paid = (m?: string) => pays.filter((p) => !m || p.payment_mode === m).reduce((a, p) => a - p.amount_paise, 0)
    const flagged = hand.filter((h) => h.handed_cash_paise !== h.expected_cash_paise || (h.stock_diff?.length ?? 0) > 0)
    const overdue = bal.filter((b) => b.overdue_paise > 0)
    return {
      collected: paid(), cash: paid('cash'), upi: paid('upi'),
      outstanding: bal.reduce((a, b) => a + b.balance_paise, 0), owing: bal.length,
      overdueN: overdue.length, overdueAmt: overdue.reduce((a, b) => a + b.overdue_paise, 0),
      flaggedN: flagged.length, awaiting: hand.filter((h) => !h.received_at).length,
    }
  },
})

/** Ticks every minute so the cutoff countdown stays current. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id) }, [])
  return now
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const fmt = useLocaleDate()
  const now = useNow()
  const plans = usePlans()
  const setup = useSetup()
  const money = useMoney()
  const packs = usePacks()
  const variants = useVariants()
  const vehicles = useVehicles()
  const day = planDates(plans.data ?? [])[0]
  const dayPlans = (plans.data ?? []).filter((p) => p.date === day)
  const orders = useOrdersFor(dayPlans.map((p) => p.id))
  const shops = useQuery({
    queryKey: ['shop', 'by-route', dayPlans.map((p) => p.route_id)],
    enabled: dayPlans.length > 0,
    queryFn: () => must<Shop[]>(supabase.from('shop').select('*').in('route_id', dayPlans.map((p) => p.route_id)).eq('active', true).order('stop_seq')),
  })
  const hi = i18n.language === 'hi'

  const live = useMemo(() => (orders.data ?? []).filter(isLive), [orders.data])
  const top = useMemo(() => {
    const qty = new Map<string, number>()
    for (const o of live) for (const l of o.order_line) qty.set(l.variant_id, (qty.get(l.variant_id) ?? 0) + l.qty_ordered)
    const pk = new Map(packs.data?.map((p) => [p.id, p]))
    return [...qty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => {
      const v = variants.data?.find((x) => x.id === id); const p = v && pk.get(v.pack_id)
      const pn = (hi && p?.name_hi) || p?.name_en || ''
      return { id, n, img: v?.image_path, name: v && v.flavour_en !== p?.name_en ? `${(hi && v.flavour_hi) || v.flavour_en} · ${pn}` : pn }
    })
  }, [live, packs.data, variants.data, hi])

  if (plans.isLoading || setup.isLoading) return <Skeleton rows={6} />

  const s = setup.data!
  const steps = [
    { done: s.live > 0, label: t('dash.stepPrices'), to: '/admin/prices' },
    { done: s.shops > 0, label: t('dash.stepShops'), to: '/admin/shops' },
    { done: s.drivers > 0, label: t('dash.stepDrivers'), to: '/admin/users' },
    { done: s.flavours > 0 && s.photos >= s.flavours, label: t('dash.stepPhotos', { n: s.photos, total: s.flavours }), to: '/admin/catalog' },
  ]
  const setupLeft = steps.filter((x) => !x.done).length

  const hour = Number(new Date(now).toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }))
  const greet = t(hour < 12 ? 'dash.morning' : hour < 17 ? 'dash.afternoon' : 'dash.evening', { name: profile?.name.split(' ')[0] ?? '' })
  const total = shops.data?.length ?? 0
  const orderedShops = new Set(live.map((o) => o.shop_id))
  const missing = (shops.data ?? []).filter((x) => !orderedShops.has(x.id))
  const pct = total ? Math.round((orderedShops.size / total) * 100) : 0
  const cases = live.reduce((a, o) => a + linesCases(o), 0)
  const value = live.reduce((a, o) => a + linesTotal(o), 0)
  // Shops order until midnight before the delivery day (IST).
  const cutoff = day ? new Date(`${day}T00:00:00+05:30`).getTime() - 60_000 : 0
  const left = cutoff - now
  const leftLabel = left <= 0 ? t('dash.cutoffPassed') : t('dash.cutoffIn', { h: Math.floor(left / 3_600_000), m: Math.floor((left % 3_600_000) / 60_000) })
  const maxTop = top[0]?.n ?? 1

  return (
    <section className="stack-lg">
      <section className="hero on-dark" aria-label={t('dash.title')}>
        <div className="grow">
          <p className="hero-kicker">{greet}</p>
          <h1>{day ? fmt(day, true) : t('loading.noPlans')}</h1>
          {day && <p className="hero-sub">{t('dash.heroLine', { routes: dayPlans.map((p) => p.route.name).join(', ') })} · <strong>{leftLabel}</strong></p>}
        </div>
        {day && (
          <div className="ring" style={{ ['--p' as string]: pct }} role="img" aria-label={t('dash.ringLabel', { n: orderedShops.size, total })}>
            <span><b>{orderedShops.size}</b><small>/ {total}</small></span>
          </div>
        )}
      </section>

      {setupLeft > 0 && (
        <div className="card stack">
          <div className="row-between"><h2>{t('dash.setupTitle')}</h2><span className="badge badge-amber">{t('dash.setupLeft', { n: setupLeft })}</span></div>
          <ul className="plain-list checklist">{steps.map((x) => (
            <li key={x.to}><Link to={x.to} className={x.done ? 'done' : ''}>
              {x.done ? <CircleCheck size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}<span>{x.label}</span></Link></li>))}
          </ul>
        </div>
      )}

      {money.data && (
        <div className="stack">
          <h2>{t('dash.money')}</h2>
          <div className="stats">
            <Kpi icon={<Wallet size={18} />} tone="green" label={t('dash.collectedToday')} value={formatPaise(money.data.collected)} sub={t('dash.cashUpi', { cash: formatPaise(money.data.cash), upi: formatPaise(money.data.upi) })} />
            <Link to="/admin/khata" className="kpi-link"><Kpi icon={<IndianRupee size={18} />} tone="blue" label={t('dash.outstanding')} value={formatPaise(money.data.outstanding)} sub={t('dash.shopsOwe', { n: money.data.owing })} /></Link>
            <Link to="/admin/khata" className="kpi-link"><Kpi icon={<AlertTriangle size={18} />} tone={money.data.overdueN ? 'amber' : 'green'} label={t('dash.overdueShops')} value={`${money.data.overdueN}`} sub={t('dash.overdueAmt', { v: formatPaise(money.data.overdueAmt) })} /></Link>
            <Link to="/admin/closing" className="kpi-link"><Kpi icon={<Scale size={18} />} tone={money.data.flaggedN || money.data.awaiting ? 'amber' : 'green'} label={t('dash.flagged')} value={`${money.data.flaggedN}`} sub={money.data.awaiting ? t('dash.flaggedSub', { n: money.data.awaiting }) : money.data.flaggedN ? t('dash.allReceived') : t('dash.nothingFlagged')} /></Link>
          </div>
        </div>
      )}

      {day && <>
        <div className="stats">
          <Kpi icon={<Store size={18} />} tone="green" label={t('dash.orders')} value={`${orderedShops.size}`} sub={t('dash.ofShops', { n: total })} />
          <Kpi icon={<Package size={18} />} tone="blue" label={t('orders.cases')} value={`${cases}`} sub={t('dash.ordersN', { count: live.length })} />
          <Kpi icon={<IndianRupee size={18} />} tone="violet" label={t('dash.value')} value={formatPaise(value)} sub={cases ? t('dash.perCase', { v: formatPaise(Math.round(value / cases)) }) : '—'} />
          <Kpi icon={<Phone size={18} />} tone={missing.length ? 'amber' : 'green'} label={t('dash.notOrdered')} value={`${missing.length}`} sub={missing.length ? t('dash.callThem') : t('dash.allIn')} />
        </div>

        <div className="dash-grid">
          <div className="stack">
            <h2>{t('dash.routes')}</h2>
            {dayPlans.map((p) => {
              const os = live.filter((o) => o.route_day_plan_id === p.id)
              const routeShops = (shops.data ?? []).filter((x) => x.route_id === p.route_id).length
              const c = os.reduce((a, o) => a + linesCases(o), 0)
              const cap = vehicles.data?.find((v) => v.id === p.vehicle_id)?.capacity_cases ?? 100
              return (
                <Link key={p.id} to="/admin/loading" className="card route-card">
                  <div className="row-between"><div className="row"><span className="icon-tile sm"><Truck size={18} aria-hidden="true" /></span><strong>{p.route.name}</strong></div>
                    <span className={`badge ${p.status === 'planning' ? 'badge-blue' : 'badge-amber'}`}>{t(`loading.status.${p.status}`)}</span></div>
                  <Meter label={t('dash.shopsOrdered')} value={os.length} max={routeShops} />
                  <Meter label={t('dash.truckFill')} value={c} max={cap} warn />
                  <div className="cell-sub num">{formatPaise(os.reduce((a, o) => a + linesTotal(o), 0))}</div>
                </Link>)
            })}
          </div>
          <div className="stack">
            <h2>{t('dash.topItems')}</h2>
            <div className="card">
              {top.length === 0 ? <Empty icon={<TrendingUp size={24} />} title={t('dash.noOrdersYet')} /> : (
                <ul className="plain-list top-list">{top.map((x) => (
                  <li key={x.id}><ProductImage path={x.img} name={x.name} size={44} />
                    <div className="grow"><div className="row-between"><span className="cell-title">{x.name}</span><strong className="num">{x.n}</strong></div>
                      <div className="bar"><i style={{ width: `${(x.n / maxTop) * 100}%` }} /></div></div></li>))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="row-between"><h2>{t('dash.callList', { n: missing.length })}</h2>
            <Link to="/admin/orders" className="button btn-sm"><ClipboardList size={16} aria-hidden="true" />{t('orders.new')}</Link></div>
          {missing.length === 0 ? <p className="muted">{t('dash.allOrdered')}</p> : (
            <div className="table-wrap"><table className="table-stack"><tbody>{missing.map((x) => (
              <tr key={x.id}><td className="lead"><div className="row"><span className="avatar-sm" aria-hidden="true">{initials(x.name)}</span>
                <div><div className="cell-title">{x.name}</div><div className="cell-sub">{[x.owner_name, x.phone].filter(Boolean).join(' · ')}</div></div></div></td>
                <td className="actions">{x.phone && <a className="button btn-sm" href={`tel:+91${x.phone}`}><Phone size={16} aria-hidden="true" />{t('shops.call')}</a>}</td></tr>))}
            </tbody></table></div>
          )}
        </div>
      </>}
    </section>
  )
}

function Kpi({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: string; label: string; value: string; sub: string }) {
  return (
    <div className={`stat kpi kpi-${tone}`}>
      <span className="kpi-icon" aria-hidden="true">{icon}</span>
      <div className="label">{label}</div>
      <div className="value num">{value}</div>
      <div className="cell-sub">{sub}</div>
    </div>
  )
}

function Meter({ label, value, max, warn }: { label: string; value: number; max: number; warn?: boolean }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  const over = warn && value > max
  return (
    <div className="meter">
      <div className="row-between cell-sub"><span>{label}</span><span className="num">{value} / {max}</span></div>
      <div className={`bar${over ? ' bar-over' : ''}`} role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}><i style={{ width: `${pct}%` }} /></div>
    </div>
  )
}
