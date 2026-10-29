import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Lock, LockOpen, Printer, Truck } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must, usePacks, useVariants, useVehicles } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise } from '../../shared/money'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Skeleton, type Msg } from '../../shared/ui/kit'
import { DateChips } from './OrdersPage'
import { useConfirm } from '../../shared/ui/confirm'
import { isLive, linesCases, linesTotal, planDates, useDrivers, useLoadLines, useOrdersFor, usePlans, type Plan , useLocaleDate } from './opsData'

const useRouteLoad = (planId: string | null) => useQuery({
  queryKey: ['route-load', planId],
  enabled: !!planId,
  queryFn: () => must<{ variant_id: string; qty_ordered: number }[]>(supabase.from('v_route_load').select('variant_id, qty_ordered').eq('route_day_plan_id', planId!)),
})

export default function LoadingPage() {
  const { t } = useTranslation()
  const fmt = useLocaleDate()
  const plans = usePlans()
  const dates = planDates(plans.data ?? [])
  const [date, setDate] = useState<string | null>(null)
  const day = date ?? dates[0] ?? ''
  const dayPlans = (plans.data ?? []).filter((p) => p.date === day)
  const [planId, setPlanId] = useState<string | null>(null)
  const vehicles = useVehicles()
  // The Vehicle dropdown picks which truck you are looking at; only that truck's trips and orders show.
  const firstTruck = dayPlans.find((p) => p.vehicle_id)?.vehicle_id ?? (dayPlans.length ? 'none' : '')
  const [truckSel, setTruck] = useState<string | null>(null)
  const truck = truckSel ?? firstTruck
  const shown = dayPlans.filter((p) => (p.vehicle_id ?? 'none') === truck)
  const plan = shown.find((p) => p.id === planId) ?? shown[0]
  const count = (k: string) => dayPlans.filter((p) => (p.vehicle_id ?? 'none') === k).length

  return (
    <section className="stack-lg">
      <div className="no-print stack-lg">
        <PageHeader title={t('loading.title')} sub={t('loading.sub')} />
        {plans.isLoading ? <Skeleton rows={2} /> : <DateChips dates={dates} value={day} onChange={(d) => { setDate(d); setPlanId(null); setTruck(null) }} />}
        {dayPlans.length > 0 && (
          <label className="field" style={{ maxWidth: 320 }}><span>{t('loading.vehicle')}</span>
            <select value={truck} onChange={(e) => { setTruck(e.target.value); setPlanId(null) }}>
              {vehicles.data?.filter((v) => v.active || count(v.id)).map((v) => <option key={v.id} value={v.id}>{v.name}{count(v.id) ? '' : ` (${t('loading.noTrip')})`}</option>)}
              {count('none') > 0 && <option value="none">{t('orders.noVehicleYet')}</option>}
            </select></label>
        )}
        {shown.length > 1 && (
          <div className="segmented" role="tablist" aria-label={t('shops.route')}>
            {shown.map((p) => <button key={p.id} type="button" role="tab" className="btn-sm" aria-selected={plan?.id === p.id} onClick={() => setPlanId(p.id)}>{p.route.name}</button>)}
          </div>
        )}
      </div>
      {!plans.isLoading && dayPlans.length === 0 && <div className="card"><Empty icon={<Truck size={26} />} title={t('loading.noPlans')} /></div>}
      {!plans.isLoading && dayPlans.length > 0 && !plan && <div className="card"><Empty icon={<Truck size={26} />} title={t('loading.noTripForTruck')}><p>{t('loading.noTripHint')}</p></Empty></div>}
      {plan && <PlanLoad key={plan.id} plan={plan} dateLabel={fmt(plan.date, true)} />}
    </section>
  )
}

function PlanLoad({ plan, dateLabel }: { plan: Plan; dateLabel: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const confirm = useConfirm()
  const packs = usePacks()
  const variants = useVariants()
  const vehicles = useVehicles()
  const drivers = useDrivers()
  const orders = useOrdersFor([plan.id])
  const locked = plan.status !== 'planning'
  const live = useRouteLoad(locked ? null : plan.id)
  const frozen = useLoadLines(locked ? plan.id : null)
  const [spares, setSpares] = useState<Record<string, number>>({})
  const [vehicleId, setVehicleId] = useState(plan.vehicle_id ?? '')
  const [driverId, setDriverId] = useState(plan.driver_id ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const hi = i18n.language === 'hi'

  const name = useMemo(() => {
    const pk = new Map(packs.data?.map((p) => [p.id, p]))
    return new Map(variants.data?.map((v) => {
      const p = pk.get(v.pack_id)
      const pn = (hi && p?.name_hi) || p?.name_en || ''
      return [v.id, { label: v.flavour_en === p?.name_en ? pn : `${(hi && v.flavour_hi) || v.flavour_en} · ${pn}`, sort: (p?.sort ?? 0) * 1000 + v.sort }]
    }))
  }, [packs.data, variants.data, hi])

  // Rows: ordered (live view or frozen) plus spares; spare rows can be added for any active flavour.
  const ordered = new Map((locked ? frozen.data?.map((l) => [l.variant_id, l.qty_ordered_total]) : live.data?.map((l) => [l.variant_id, l.qty_ordered])) ?? [])
  const spare = locked ? new Map(frozen.data?.map((l) => [l.variant_id, l.qty_spare])) : new Map(Object.entries(spares))
  const ids = [...new Set([...ordered.keys(), ...spare.keys()])].filter((id) => (ordered.get(id) ?? 0) + (spare.get(id) ?? 0) > 0 || !locked)
    .sort((a, b) => (name.get(a)?.sort ?? 0) - (name.get(b)?.sort ?? 0))
  const totalOrdered = [...ordered.values()].reduce((s, n) => s + n, 0)
  const totalSpare = [...spare.values()].reduce((s, n) => s + n, 0)
  const vehicle = vehicles.data?.find((v) => v.id === vehicleId)
  const over = vehicle ? totalOrdered + totalSpare - vehicle.capacity_cases : 0
  const stops = (orders.data ?? []).filter(isLive).sort((a, b) => a.shop.stop_seq - b.shop.stop_seq)
  const [adding, setAdding] = useState('')

  const refresh = () => ['plans', 'admin-orders', 'route-load', 'load-lines'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }))
  const lock = async () => {
    if (!(await confirm({ title: t('loading.lock'), body: t('loading.confirmLock', { n: stops.length }), confirm: t('loading.lock') }))) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('lock_load', {
      p_plan_id: plan.id, p_vehicle_id: vehicleId, p_driver_id: driverId,
      p_spares: Object.entries(spares).filter(([, n]) => n > 0).map(([variant_id, qty]) => ({ variant_id, qty })),
    })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: errorMessage(t, error) }); else { setMsg({ kind: 'success', text: t('loading.locked') }); refresh() }
  }
  const unlock = async () => {
    if (!(await confirm({ title: t('loading.unlock'), body: t('loading.confirmUnlock'), confirm: t('loading.unlock'), danger: true }))) return
    const { error } = await supabase.rpc('unlock_load', { p_plan_id: plan.id })
    if (error) setMsg({ kind: 'error', text: errorMessage(t, error) }); else { setMsg(null); refresh() }
  }
  // Admin: the vehicle is saved on the trip straight away, so Orders and the truck filter agree.
  const changeVehicle = async (id: string) => {
    setVehicleId(id)
    if (!id || profile?.role !== 'admin') return
    const { error } = await supabase.rpc('set_trip_vehicle', { p_plan_id: plan.id, p_vehicle_id: id })
    if (error) setMsg({ kind: 'error', text: errorMessage(t, error) }); else void qc.invalidateQueries({ queryKey: ['plans'] })
  }
  const setSpare = (id: string, n: number) => setSpares((s) => ({ ...s, [id]: Math.max(0, Math.min(999, Math.floor(n) || 0)) }))
  const driverName = drivers.data?.find((d) => d.user_id === driverId)?.name

  if (live.isLoading || frozen.isLoading || orders.isLoading) return <Skeleton rows={5} />
  return (
    <>
      <div className="no-print stack-lg">
        <div className="stats">
          <div className="stat"><div className="label">{t('loading.stops')}</div><div className="value">{stops.length}</div></div>
          <div className="stat"><div className="label">{t('loading.ordered')}</div><div className="value">{totalOrdered}</div></div>
          <div className="stat"><div className="label">{t('loading.spare')}</div><div className="value">{totalSpare}</div></div>
          <div className="stat"><div className="label">{t('loading.onTruck')}</div><div className="value" style={over > 0 ? { color: 'var(--danger)' } : undefined}>{totalOrdered + totalSpare}{vehicle && <span className="muted"> / {vehicle.capacity_cases}</span>}</div></div>
        </div>
        {over > 0 && <Alert msg={{ kind: 'warn', text: t('loading.overCapacity', { n: over }) }} />}
        <Alert msg={msg} />
        {locked && <Alert msg={{ kind: 'success', text: driverName
          ? t('loading.lockedNote', { vehicle: vehicle?.name ?? '—', driver: driverName })
          : t('loading.lockedNoteNoDriver', { vehicle: vehicle?.name ?? '—' }) }} />}

        <div className="card form-grid">
          <label className="field"><span>{plan.vehicle_id ? t('loading.vehicle') : t('loading.assignTruck')}</span>
            <select value={vehicleId} disabled={locked || !!plan.vehicle_id} onChange={(e) => void changeVehicle(e.target.value)}>
              <option value="">{t('loading.choose')}</option>
              {vehicles.data?.filter((v) => v.active).map((v) => <option key={v.id} value={v.id}>{v.name} ({t('network.cases', { n: v.capacity_cases })})</option>)}
            </select>
</label>
          <label className="field"><span>{t('loading.driver')}</span>
            <select value={driverId} disabled={locked} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">{t('loading.choose')}</option>
              {drivers.data?.map((d) => <option key={d.user_id} value={d.user_id}>{d.name}</option>)}
            </select>
            {!drivers.data?.length && <span className="hint">{t('loading.noDrivers')}</span>}</label>
        </div>

        <div className="table-wrap table-scroll">
          <table className="dense">
            <thead><tr><th scope="col">{t('loading.item')}</th><th scope="col">{t('loading.ordered')}</th><th scope="col">{t('loading.spare')}</th><th scope="col">{t('loading.total')}</th></tr></thead>
            <tbody>
              {ids.filter((id) => (ordered.get(id) ?? 0) > 0 || spare.has(id)).map((id) => (
                <tr key={id}>
                  <th scope="row">{name.get(id)?.label}</th>
                  <td className="num">{ordered.get(id) ?? 0}</td>
                  <td>{locked ? <span className="num">{spare.get(id) ?? 0}</span>
                    : <input type="number" inputMode="numeric" min={0} max={999} aria-label={`${t('loading.spare')}: ${name.get(id)?.label}`} value={spares[id] ?? 0} onChange={(e) => setSpare(id, Number(e.target.value))} />}</td>
                  <td className="num"><strong>{(ordered.get(id) ?? 0) + (spare.get(id) ?? 0)}</strong></td>
                </tr>))}
              {ids.length === 0 && <tr><td colSpan={4} className="muted">{t('loading.nothing')}</td></tr>}
            </tbody>
          </table>
        </div>
        {!locked && (
          <label className="field" style={{ maxWidth: 420 }}><span>{t('loading.addSpare')}</span>
            <select value={adding} onChange={(e) => { if (e.target.value) setSpare(e.target.value, 1); setAdding('') }}>
              <option value="">{t('loading.choose')}</option>
              {[...name.entries()].filter(([id]) => !ordered.has(id) && !(id in spares)).sort((a, b) => a[1].sort - b[1].sort).map(([id, n]) => <option key={id} value={id}>{n.label}</option>)}
            </select></label>
        )}

        <div className="stack">
          <h2>{t('loading.stopsTitle')} ({stops.length})</h2>
          {stops.length === 0 ? <p className="muted">{t('loading.nothing')}</p> : (
            <div className="table-wrap"><table className="table-stack">
              <thead><tr><th scope="col">{t('shops.name')}</th><th scope="col">{t('orders.cases')}</th><th scope="col">{t('shop.total')}</th></tr></thead>
              <tbody>{stops.map((o) => (
                <tr key={o.id}><td className="lead"><div className="cell-title">{o.shop.name}</div><div className="cell-sub">#{o.shop.stop_seq}{o.shop.phone ? ` · ${o.shop.phone}` : ''}</div></td>
                  <td data-label={t('orders.cases')} className="num">{linesCases(o)}</td>
                  <td data-label={t('shop.total')} className="num">{formatPaise(linesTotal(o))}</td></tr>))}</tbody>
            </table></div>
          )}
        </div>

        <div className="page-actions">
          <button type="button" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />{t('loading.print')}</button>
          {!locked && <button type="button" className="primary" disabled={busy || !vehicleId || !driverId || totalOrdered + totalSpare === 0} onClick={() => void lock()}><Lock size={18} aria-hidden="true" />{t('loading.lock')}</button>}
          {plan.status === 'loaded' && profile?.role === 'admin' && <button type="button" className="danger" onClick={() => void unlock()}><LockOpen size={18} aria-hidden="true" />{t('loading.unlock')}</button>}
        </div>
      </div>

      {/* Printed for the helpers: what to load, then what to drop at each stop. */}
      <div className="print-sheet" aria-hidden="true">
        <h1>{t('loading.printTitle', { route: plan.route.name, date: dateLabel })}</h1>
        <p>{t('loading.vehicle')}: {vehicle?.name ?? '—'} · {t('loading.driver')}: {driverName ?? '—'} · {t('loading.onTruck')}: {totalOrdered + totalSpare}</p>
        <table><thead><tr><th>{t('loading.item')}</th><th>{t('loading.ordered')}</th><th>{t('loading.spare')}</th><th>{t('loading.total')}</th><th>✓</th></tr></thead>
          <tbody>{ids.filter((id) => (ordered.get(id) ?? 0) + (spare.get(id) ?? 0) > 0).map((id) => (
            <tr key={id}><td>{name.get(id)?.label}</td><td>{ordered.get(id) ?? 0}</td><td>{spare.get(id) ?? 0}</td><td><b>{(ordered.get(id) ?? 0) + (spare.get(id) ?? 0)}</b></td><td></td></tr>))}</tbody></table>
        <h2>{t('loading.stopsTitle')}</h2>
        <table><thead><tr><th>#</th><th>{t('shops.name')}</th><th>{t('loading.items')}</th><th>{t('orders.cases')}</th><th>{t('shop.total')}</th></tr></thead>
          <tbody>{stops.map((o) => (
            <tr key={o.id}><td>{o.shop.stop_seq}</td><td>{o.shop.name}<br />{o.shop.phone}</td>
              <td>{o.order_line.map((l) => `${name.get(l.variant_id)?.label} × ${l.qty_ordered}`).join(', ')}</td>
              <td>{linesCases(o)}</td><td>{formatPaise(linesTotal(o))}</td></tr>))}</tbody></table>
      </div>
    </>
  )
}
