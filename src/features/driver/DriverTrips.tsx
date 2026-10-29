import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Lock, Truck } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { useAuth } from '../../shared/api/auth'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, Skeleton, type Msg } from '../../shared/ui/kit'
import { useConfirm } from '../../shared/ui/confirm'
import { useLocaleDate } from '../admin/opsData'
import { useDriverTrips, useTripOrders, variantLabel, type Snapshot } from './data'

const live = (o: { status: string }) => o.status !== 'cancelled'

/** Dates at the top: every upcoming trip of this vehicle with its order count. */
export function TripStrip({ activeId }: { activeId?: string }) {
  const { t } = useTranslation()
  const fmt = useLocaleDate()
  const trips = useDriverTrips()
  if (trips.isLoading) return <Skeleton rows={1} />
  if (!trips.data?.length) return null
  return (
    <div className="segmented" role="tablist" aria-label={t('driver.myTrips')} style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
      {trips.data.map((p) => {
        const n = p.orders.filter(live).length
        const to = p.status === 'planning' ? `/driver/load/${p.id}` : '/driver'
        return (
          <Link key={p.id} to={to} role="tab" className="button btn-sm" aria-selected={p.id === activeId} style={{ whiteSpace: 'nowrap' }}>
            {fmt(p.date)} <span className={`badge ${p.status === 'planning' ? 'badge-blue' : 'badge-green'}`}>{t('driver.tripOrders', { n })}</span>
            {p.status !== 'planning' && <span className="muted"> · {t(`loading.status.${p.status}`)}</span>}
          </Link>)
      })}
    </div>
  )
}

/** A trip not loaded yet: the driver sees its orders, adds spares for van sales and locks the load himself. */
export function LoadTrip({ snap, onLocked }: { snap: Snapshot; onLocked: () => void }) {
  const { t, i18n } = useTranslation()
  const hi = i18n.language === 'hi'
  const fmt = useLocaleDate()
  const { planId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const trips = useDriverTrips()
  const orders = useTripOrders(planId)
  const [spares, setSpares] = useState<Record<string, number>>({})
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const cat = useMemo(() => new Map(snap.catalog.map((c) => [c.variant.id, c])), [snap.catalog])
  const label = (id: string) => (cat.get(id) ? variantLabel(cat.get(id)!, hi) : '—')

  const trip = trips.data?.find((p) => p.id === planId)
  if (trips.isLoading || orders.isLoading) return <Skeleton rows={5} />
  if (!trip) return <Navigate to="/driver" replace />

  const list = (orders.data ?? []).filter(live).sort((a, b) => a.shop.stop_seq - b.shop.stop_seq)
  const totals = new Map<string, number>()
  for (const o of list) for (const l of o.order_line) totals.set(l.variant_id, (totals.get(l.variant_id) ?? 0) + l.qty_ordered)
  const ids = [...new Set([...totals.keys(), ...Object.keys(spares)])].sort((a, b) => label(a).localeCompare(label(b), i18n.language))
  const ordered = [...totals.values()].reduce((a, n) => a + n, 0)
  const spare = Object.values(spares).reduce((a, n) => a + n, 0)
  const setSpare = (id: string, n: number) => setSpares((s) => ({ ...s, [id]: Math.max(0, Math.min(999, Math.floor(n) || 0)) }))
  const choices = snap.catalog.filter((c) => c.price && !totals.has(c.variant.id) && !(c.variant.id in spares))
    .sort((a, b) => variantLabel(a, hi).localeCompare(variantLabel(b, hi), i18n.language))

  const lock = async () => {
    if (!(await confirm({ title: t('loading.lock'), body: t('driver.confirmLoad', { n: list.length, cases: ordered + spare }), confirm: t('loading.lock') }))) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('lock_load', {
      p_plan_id: trip.id, p_vehicle_id: profile!.vehicle_id, p_driver_id: profile!.user_id,
      p_spares: Object.entries(spares).filter(([, n]) => n > 0).map(([variant_id, qty]) => ({ variant_id, qty })),
    })
    setBusy(false)
    if (error) { setMsg({ kind: 'error', text: errorMessage(t, error) }); return }
    for (const k of ['driver-trips', 'driver-trip-orders']) void qc.invalidateQueries({ queryKey: [k] })
    onLocked(); navigate('/driver')
  }

  return (
    <div className="stack-lg">
      <TripStrip activeId={trip.id} />
      <button type="button" className="ghost" style={{ paddingLeft: 0, alignSelf: 'flex-start' }} onClick={() => navigate('/driver')}><ArrowLeft size={18} aria-hidden="true" />{t('driver.allStops')}</button>
      <div><h1>{fmt(trip.date, true)}</h1><p className="muted">{trip.route.name} · {trip.vehicle?.name}</p></div>
      <div className="stats">
        <div className="stat"><div className="label">{t('loading.stops')}</div><div className="value">{list.length}</div></div>
        <div className="stat"><div className="label">{t('loading.onTruck')}</div><div className="value num">{ordered + spare}</div><div className="cell-sub">{t('driver.orderedSpare', { o: ordered, s: spare })}</div></div>
      </div>

      <div className="card card-flush">
        {ids.length === 0 ? <div style={{ padding: 16 }}><Empty icon={<Truck size={24} />} title={t('loading.nothing')} /></div> : (
          <table className="dense"><thead><tr><th scope="col">{t('loading.item')}</th><th scope="col">{t('loading.ordered')}</th><th scope="col">{t('loading.spare')}</th></tr></thead>
            <tbody>{ids.map((id) => (
              <tr key={id}><th scope="row">{label(id)}</th><td className="num">{totals.get(id) ?? 0}</td>
                <td><input type="number" inputMode="numeric" min={0} max={999} style={{ width: 72 }} placeholder="0" aria-label={`${t('loading.spare')}: ${label(id)}`}
                  value={spares[id] ? spares[id] : ''} onFocus={(e) => e.target.select()} onChange={(e) => setSpare(id, Number(e.target.value))} /></td></tr>))}
            </tbody></table>)}
      </div>
      <label className="field"><span>{t('loading.addSpare')}</span>
        <select value={adding} onChange={(e) => { if (e.target.value) setSpare(e.target.value, 1); setAdding('') }}>
          <option value="">{t('loading.choose')}</option>
          {choices.map((c) => <option key={c.variant.id} value={c.variant.id}>{variantLabel(c, hi)}</option>)}
        </select></label>

      <div className="stack">
        <h2>{t('loading.stopsTitle')} ({list.length})</h2>
        <ul className="plain-list stop-list">{list.map((o) => (
          <li key={o.id} className="stop stop-todo"><span className="stop-seq">{o.shop.stop_seq || '·'}</span>
            <span className="grow"><span className="cell-title">{o.shop.name}</span>
              <span className="cell-sub">{[...o.order_line].sort((a, b) => label(a.variant_id).localeCompare(label(b.variant_id), i18n.language)).map((l) => `${label(l.variant_id)} × ${l.qty_ordered}`).join(', ')}</span></span>
            <span className="badge badge-blue num">{o.order_line.reduce((a, l) => a + l.qty_ordered, 0)}</span></li>))}
        </ul>
      </div>

      <Alert msg={msg} />
      <button type="button" className="primary btn-block big" disabled={busy || ordered + spare === 0} onClick={() => void lock()}>
        <Lock size={20} aria-hidden="true" />{t('driver.loadTruck', { n: ordered + spare })}</button>
    </div>
  )
}
