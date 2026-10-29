import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, ClipboardList, Phone, Plus, Truck } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must, useVehicles, type Shop } from '../../shared/api/db'
import { formatPaise } from '../../shared/money'
import { useAuth } from '../../shared/api/auth'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton } from '../../shared/ui/kit'
import { OrderEditor } from './OrderEditor'
import { isLive, linesCases, linesTotal, ordersByDate, planDates, useOrderCounts, useOrdersFor, usePlans, todayIST, addDays, type AdminOrder, type Plan } from './opsData'
import { useLocaleDate } from './opsData'

export function DateChips({ dates, value, counts, onChange }: { dates: string[]; value: string; counts?: Record<string, number>; onChange: (d: string) => void }) {
  const { t } = useTranslation()
  const fmt = useLocaleDate()
  return (
    <div className="segmented" role="tablist" aria-label={t('orders.deliveryDay')}>
      {dates.map((d) => {
        const n = counts?.[d] ?? 0
        return (
          <button key={d} type="button" role="tab" className="btn-sm" aria-selected={value === d}
            aria-label={n ? t('orders.dayWithCount', { date: fmt(d), n }) : fmt(d)} onClick={() => onChange(d)}>
            {fmt(d)}{n > 0 && <span className="badge badge-blue" aria-hidden="true">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}

const STATUS_BADGE: Record<AdminOrder['status'], string> = { placed: 'badge-blue', locked: 'badge-amber', delivered: 'badge-green', partially_delivered: 'badge-green', cancelled: '' }

export default function OrdersPage() {
  const { t } = useTranslation()
  const fmt = useLocaleDate()
  const plans = usePlans()
  const allPlans = plans.data ?? []
  const dates = planDates(allPlans)
  const counts = useOrderCounts(allPlans.map((p) => p.id))
  const countsByDate = ordersByDate(allPlans, counts.data ?? {})
  // Default to the nearest delivery day that actually has orders; fall back to the nearest day.
  const defaultDay = dates.find((d) => countsByDate[d] > 0) ?? dates[0] ?? ''
  const [date, setDate] = useState<string | null>(null)
  const day = date ?? defaultDay
  const dayPlans = allPlans.filter((p) => p.date === day)
  const [route, setRoute] = useState('')
  const orders = useOrdersFor(dayPlans.map((p) => p.id))
  const [open, setOpen] = useState<{ order?: AdminOrder; shop?: Shop; plan: Plan } | null>(null)
  const [picking, setPicking] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)
  const [adding, setAdding] = useState(false)
  const [moving, setMoving] = useState<AdminOrder | null>(null)
  const vehicles = useVehicles()
  const vName = (id: string | null) => vehicles.data?.find((v) => v.id === id)?.name
  const isAdmin = useAuth().profile?.role === 'admin'

  const planById = new Map(dayPlans.map((p) => [p.id, p]))
  const forRoute = (orders.data ?? []).filter((o) => !route || planById.get(o.route_day_plan_id)?.route_id === route)
  const cancelledCount = forRoute.filter((o) => !isLive(o)).length
  const list = forRoute.filter((o) => showCancelled || isLive(o)).sort((a, b) => a.shop.stop_seq - b.shop.stop_seq)
  const live = list.filter(isLive)

  return (
    <section className="stack-lg">
      <PageHeader title={t('orders.title')} sub={day ? t('orders.sub', { date: fmt(day, true), n: live.length, total: formatPaise(live.reduce((s, o) => s + linesTotal(o), 0)) }) : undefined}
        actions={<button type="button" className="primary" disabled={!isAdmin && !dayPlans.length} onClick={() => (isAdmin ? setAdding(true) : setPicking(true))}><Plus size={18} aria-hidden="true" />{t('orders.new')}</button>} />
      {plans.isLoading ? <Skeleton rows={2} /> : <DateChips dates={dates} value={day} counts={countsByDate} onChange={(d) => { setDate(d); setRoute('') }} />}
      {dayPlans.length > 1 && (
        <div className="segmented" role="tablist" aria-label={t('shops.route')}>
          {[{ route_id: '', route: { name: t('common.all') } }, ...dayPlans].map((p) => (
            <button key={p.route_id || 'all'} type="button" role="tab" className="btn-sm" aria-selected={route === p.route_id} onClick={() => setRoute(p.route_id)}>{p.route.name}</button>))}
        </div>
      )}
      {isAdmin && dayPlans.length > 0 && <TripBar plans={dayPlans} />}
      {cancelledCount > 0 && <label className="chip"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />{t('orders.showCancelled', { n: cancelledCount })}</label>}
      {orders.isLoading ? <Skeleton rows={4} /> : list.length === 0 ? (
        <div className="card"><Empty icon={<ClipboardList size={26} />} title={t('orders.empty')}><p>{t('orders.emptyHint')}</p></Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="table-stack">
            <thead><tr><th scope="col">{t('shops.name')}</th><th scope="col">{t('orders.cases')}</th><th scope="col">{t('shop.total')}</th><th scope="col">{t('users.status')}</th><th scope="col"><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
            <tbody>{list.map((o) => (
              <tr key={o.id} className={isLive(o) ? '' : 'dim'}>
                <td className="lead"><div className="cell-title">{o.shop.name}</div>
                  <div className="cell-sub">{planById.get(o.route_day_plan_id)?.route.name} · {vName(planById.get(o.route_day_plan_id)?.vehicle_id ?? null) ?? t('orders.noVehicleYet')} · #{o.shop.stop_seq} · {t(`orders.source.${o.source}`)}</div></td>
                <td data-label={t('orders.cases')} className="num">{linesCases(o)}</td>
                <td data-label={t('shop.total')} className="num"><strong>{formatPaise(linesTotal(o))}</strong></td>
                <td data-label={t('users.status')}><span className={`badge ${STATUS_BADGE[o.status]}`}>{t(`shop.status.${o.status}`)}</span>
                  {o.cancel_reason && o.status === 'cancelled' && <div className="cell-sub">{o.cancel_reason}</div>}</td>
                <td className="actions">
                  {o.shop.phone && <a className="button btn-sm" href={`tel:+91${o.shop.phone}`} aria-label={`${t('shops.call')} ${o.shop.name}`}><Phone size={16} aria-hidden="true" /></a>}
                  {isAdmin && o.status === 'placed' && planById.get(o.route_day_plan_id)?.status === 'planning' && <button type="button" className="btn-sm" onClick={() => setMoving(o)}><ArrowRightLeft size={16} aria-hidden="true" />{t('orders.move')}</button>}
                  <button type="button" className="btn-sm" onClick={() => setOpen({ order: o, plan: planById.get(o.route_day_plan_id)! })}>{o.status === 'placed' ? t('common.edit') : t('common.view')}</button>
                </td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={picking} title={t('orders.pickShop')} onClose={() => setPicking(false)}>
        {picking && <ShopPicker plans={dayPlans} onPick={(shop, plan) => {
          setPicking(false)
          const existing = (orders.data ?? []).find((o) => o.shop_id === shop.id && o.status === 'placed' && o.route_day_plan_id === plan.id)
          setOpen({ order: existing, shop, plan })
        }} />}
      </Sheet>
      <Sheet open={!!moving} title={moving ? `${t('orders.move')}: ${moving.shop.name}` : ''} onClose={() => setMoving(null)}>
        {moving && <MoveOrder order={moving} initialDate={day} onDone={() => setMoving(null)} />}
      </Sheet>
      <Sheet open={adding} title={t('orders.new')} onClose={() => setAdding(false)}>
        {adding && <AddOrder initialDate={day || todayIST()} onReady={(shop, plan, order) => { setAdding(false); setDate(plan.date); setRoute(''); setOpen({ shop, plan, order }) }} />}
      </Sheet>
      <Sheet open={!!open} wide title={open ? `${open.order?.shop.name ?? open.shop?.name} · ${fmt(open.plan.date)}` : ''} onClose={() => setOpen(null)}>
        {open && <OrderEditor key={open.order?.id ?? open.shop?.id}
          shopId={open.order?.shop_id ?? open.shop!.id} shopName={`${open.plan.route.name} · ${fmt(open.plan.date, true)}`} planId={open.plan.id}
          orderId={open.order?.status === 'placed' ? open.order.id : undefined}
          initial={Object.fromEntries((open.order?.order_line ?? []).map((l) => [l.variant_id, l.qty_ordered]))}
          editable={open.plan.status === 'planning' && (!open.order || open.order.status === 'placed')}
          onDone={() => setOpen(null)} />}
      </Sheet>
    </section>
  )
}

/** Only shops whose route delivers on the selected day can be picked. */
function ShopPicker({ plans, onPick }: { plans: Plan[]; onPick: (s: Shop, p: Plan) => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const routeIds = plans.map((p) => p.route_id)
  const shops = useQuery({
    queryKey: ['shop', 'by-route', routeIds],
    queryFn: () => must<Shop[]>(supabase.from('shop').select('*').in('route_id', routeIds).eq('active', true).order('stop_seq').order('name')),
  })
  const planFor = useMemo(() => new Map(plans.map((p) => [p.route_id, p])), [plans])
  const list = (shops.data ?? []).filter((s) => !q || `${s.name} ${s.owner_name ?? ''} ${s.phone ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="stack">
      <input type="search" aria-label={t('shops.searchLabel')} placeholder={t('shops.searchLabel')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {shops.isLoading ? <Skeleton /> : list.length === 0 ? <p className="muted">{t('common.noMatches')}</p> : (
        <ul className="plain-list more-list">{list.map((s) => {
          const p = planFor.get(s.route_id)!
          return (
            <li key={s.id}><button type="button" className="btn-block" disabled={p.status !== 'planning'} onClick={() => onPick(s, p)}>
              <span className="grow" style={{ textAlign: 'left' }}><span className="cell-title">{s.name}</span><span className="cell-sub" style={{ display: 'block' }}>{p.route.name} · #{s.stop_seq}{p.status !== 'planning' ? ` · ${t('orders.truckLoaded')}` : ''}</span></span>
            </button></li>)
        })}</ul>
      )}
    </div>
  )
}

type ShopWithRoute = Shop & { route: { name: string } }
type PlanRow = Plan & { vehicle: { name: string } | null }

/**
 * Admin: any shop, any day in the next two weeks, on any truck going that day.
 * The trip can be the shop's own route (added for that day if it doesn't usually run) or another
 * route's trip, so one truck can carry extra shops. The vehicle chosen here is pre-set for Loading.
 */
function AddOrder({ initialDate, onReady }: { initialDate: string; onReady: (s: Shop, p: Plan, o?: AdminOrder) => void }) {
  const { t } = useTranslation()
  const fmt = useLocaleDate()
  const qc = useQueryClient()
  const vehicles = useVehicles()
  const [date, setDate] = useState(initialDate)
  const [q, setQ] = useState('')
  const [shop, setShop] = useState<ShopWithRoute | null>(null)
  const [trip, setTrip] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const shops = useQuery({
    queryKey: ['shop', 'active-all'],
    queryFn: () => must<ShopWithRoute[]>(supabase.from('shop').select('*, route(name)').eq('active', true).order('name')),
  })
  const trips = useQuery({
    queryKey: ['plans', 'on', date],
    enabled: !!date,
    queryFn: () => must<PlanRow[]>(supabase.from('route_day_plan').select('id, route_id, date, status, vehicle_id, driver_id, route(name), vehicle(name)').eq('date', date).order('created_at')),
  })
  const open = (trips.data ?? []).filter((p) => p.status === 'planning')
  const ownTrip = shop && (trips.data ?? []).find((p) => p.route_id === shop.route_id)
  const NEW = 'new'
  // Default trip: the shop's own route that day, else a new trip for it.
  const tripId = trip || (ownTrip?.status === 'planning' ? ownTrip.id : NEW)
  const chosen = open.find((p) => p.id === tripId)
  const vehicleId = vehicle || chosen?.vehicle_id || ''

  const pickShop = (s: ShopWithRoute) => { setShop(s); setTrip(''); setVehicle(''); setErr(null) }
  const changeDate = (d: string) => { setDate(d); setTrip(''); setVehicle('') }

  const go = async () => {
    if (!shop) return
    setErr(null); setBusy(true)
    try {
      let id = chosen?.id
      if (!chosen || (vehicleId && vehicleId !== chosen.vehicle_id)) {
        id = await must<string>(supabase.rpc('add_delivery_day', { p_route_id: chosen?.route_id ?? shop.route_id, p_date: date, p_vehicle_id: vehicleId || null }))
      }
      const plan = await must<Plan>(supabase.from('route_day_plan').select('id, route_id, date, status, vehicle_id, driver_id, route(name)').eq('id', id!).single())
      if (plan.status !== 'planning') { setErr(t('orders.todayLoaded', { route: plan.route.name })); return }
      const existing = await must<AdminOrder[]>(supabase.from('orders')
        .select('id, status, source, created_at, updated_at, shop_id, route_day_plan_id, cancel_reason, shop(name, owner_name, phone, stop_seq), order_line(variant_id, qty_ordered, unit_price_paise)')
        .eq('shop_id', shop.id).eq('route_day_plan_id', plan.id).eq('status', 'placed'))
      await qc.invalidateQueries({ queryKey: ['plans'] })
      onReady(shop, plan, existing[0])
    } catch (e) { setErr(errorMessage(t, e)) }
    finally { setBusy(false) }
  }

  const list = (shops.data ?? []).filter((s) => !q || `${s.name} ${s.owner_name ?? ''} ${s.phone ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="stack">
      <label className="field"><span>{t('orders.deliveryDay')}</span>
        <input type="date" min={todayIST()} max={addDays(todayIST(), 14)} value={date} onChange={(e) => changeDate(e.target.value)} /></label>
      {!shop ? <>
        <input type="search" aria-label={t('shops.searchLabel')} placeholder={t('shops.searchLabel')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {shops.isLoading ? <Skeleton /> : list.length === 0 ? <p className="muted">{t('common.noMatches')}</p> : (
          <ul className="plain-list more-list">{list.map((s) => (
            <li key={s.id}><button type="button" className="btn-block" onClick={() => pickShop(s)}>
              <span className="grow" style={{ textAlign: 'left' }}><span className="cell-title">{s.name}</span><span className="cell-sub" style={{ display: 'block' }}>{s.route.name} · #{s.stop_seq}</span></span>
            </button></li>))}</ul>
        )}
      </> : <>
        <div className="row-between"><div><div className="cell-title">{shop.name}</div><div className="cell-sub">{shop.route.name}</div></div>
          <button type="button" className="btn-sm" onClick={() => setShop(null)}>{t('orders.changeShop')}</button></div>
        <label className="field"><span>{t('orders.trip')}</span>
          <select value={tripId} onChange={(e) => { setTrip(e.target.value); setVehicle('') }}>
            {open.map((p) => <option key={p.id} value={p.id}>{p.route.name} · {p.vehicle?.name ?? t('orders.noVehicleYet')}</option>)}
            {!ownTrip && <option value={NEW}>{t('orders.newTrip', { route: shop.route.name, date: fmt(date) })}</option>}
          </select></label>
        {ownTrip && ownTrip.status !== 'planning' && <Alert msg={{ kind: 'warn', text: t('orders.todayLoaded', { route: ownTrip.route.name }) }} />}
        <label className="field"><span>{t('loading.vehicle')}</span>
          <select value={vehicleId} onChange={(e) => setVehicle(e.target.value)}>
            <option value="">{t('orders.chooseAtLoading')}</option>
            {vehicles.data?.filter((v) => v.active).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select></label>
        <p className="muted">{t('orders.vehicleHint')}</p>
        {err && <Alert msg={{ kind: 'error', text: err }} />}
        <div className="row"><button type="button" className="primary" disabled={busy || (tripId !== NEW && !chosen)} onClick={() => void go()}>{t('orders.continue')}</button></div>
      </>}
    </div>
  )
}
/** Admin: the trucks going on this day. Set or change the vehicle for each trip until it is loaded. */
function TripBar({ plans }: { plans: Plan[] }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const vehicles = useVehicles()
  const [err, setErr] = useState<string | null>(null)
  const set = async (p: Plan, vehicleId: string) => {
    setErr(null)
    try {
      await must(supabase.rpc('add_delivery_day', { p_route_id: p.route_id, p_date: p.date, p_vehicle_id: vehicleId }))
      await qc.invalidateQueries({ queryKey: ['plans'] })
    } catch (e) { setErr(errorMessage(t, e)) }
  }
  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {plans.map((p) => (
          <label key={p.id} className="field card" style={{ minWidth: 220, padding: 12 }}>
            <span><Truck size={14} aria-hidden="true" /> {t('orders.tripVehicle', { route: p.route.name })}</span>
            <select value={p.vehicle_id ?? ''} disabled={p.status !== 'planning'} onChange={(e) => e.target.value && void set(p, e.target.value)}>
              <option value="">{t('orders.chooseAtLoading')}</option>
              {vehicles.data?.filter((v) => v.active || v.id === p.vehicle_id).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>))}
      </div>
      {err && <Alert msg={{ kind: 'error', text: err }} />}
    </div>
  )
}

/** Admin: move an open order onto another open trip (another truck and/or another day). */
function MoveOrder({ order, initialDate, onDone }: { order: AdminOrder; initialDate: string; onDone: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [date, setDate] = useState(initialDate)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const trips = useQuery({
    queryKey: ['plans', 'on', date],
    enabled: !!date,
    queryFn: () => must<PlanRow[]>(supabase.from('route_day_plan').select('id, route_id, date, status, vehicle_id, driver_id, route(name), vehicle(name)').eq('date', date).order('created_at')),
  })
  const list = (trips.data ?? []).filter((p) => p.status === 'planning' && p.id !== order.route_day_plan_id)
  const move = async (p: PlanRow) => {
    setErr(null); setBusy(true)
    try {
      await must(supabase.rpc('move_order', { p_order_id: order.id, p_plan_id: p.id }))
      for (const k of ['plans', 'admin-orders', 'admin-order-counts']) void qc.invalidateQueries({ queryKey: [k] })
      onDone()
    } catch (e) { setErr(errorMessage(t, e)) }
    finally { setBusy(false) }
  }
  return (
    <div className="stack">
      <label className="field"><span>{t('orders.deliveryDay')}</span>
        <input type="date" min={todayIST()} max={addDays(todayIST(), 14)} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      {trips.isLoading ? <Skeleton /> : list.length === 0 ? <p className="muted">{t('orders.noOtherTrips')}</p> : (
        <ul className="plain-list more-list">{list.map((p) => (
          <li key={p.id}><button type="button" className="btn-block" disabled={busy} onClick={() => void move(p)}>
            <span className="grow" style={{ textAlign: 'left' }}><span className="cell-title">{p.route.name}</span>
              <span className="cell-sub" style={{ display: 'block' }}>{p.vehicle?.name ?? t('orders.noVehicleYet')}</span></span>
          </button></li>))}</ul>
      )}
      <p className="muted">{t('orders.moveHint')}</p>
      {err && <Alert msg={{ kind: 'error', text: err }} />}
    </div>
  )
}