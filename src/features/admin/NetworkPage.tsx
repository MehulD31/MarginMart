import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Route as RouteIcon, Truck } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must, useRoutes, useVehicles, WEEKDAYS, type Route, type Vehicle } from '../../shared/api/db'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton, StatusBadge } from '../../shared/ui/kit'

export default function NetworkPage() {
  const { t } = useTranslation()
  const routes = useRoutes()
  const vehicles = useVehicles()
  const [route, setRoute] = useState<Partial<Route> | null>(null)
  const [vehicle, setVehicle] = useState<Partial<Vehicle> | null>(null)

  return (
    <section className="stack-lg">
      <PageHeader title={t('network.title')} sub={t('network.sub')} />

      <div className="stack">
        <div className="row-between"><h2>{t('network.routes')}</h2>
          <button type="button" className="btn-sm" onClick={() => setRoute({ visit_days: [], active: true })}><Plus size={16} aria-hidden="true" />{t('network.addRoute')}</button></div>
        {routes.isLoading ? <Skeleton rows={2} /> : !routes.data?.length ? (
          <div className="card"><Empty icon={<RouteIcon size={26} />} title={t('network.noRoutes')} /></div>
        ) : (
          <div className="pack-grid">{routes.data.map((r) => (
            <button key={r.id} type="button" className={`pack-card ${r.active ? '' : 'dim'}`} onClick={() => setRoute(r)}>
              <div className="thumb" style={{ background: 'var(--brand-50)', color: 'var(--brand-700)' }}><RouteIcon size={26} aria-hidden="true" /></div>
              <div className="grow">
                <div className="cell-title">{r.name}</div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {WEEKDAYS.map((d) => <span key={d} className={`badge ${r.visit_days.includes(d) ? 'badge-green' : ''}`} style={r.visit_days.includes(d) ? undefined : { opacity: 0.5 }}>{t(`days.${d}`)}</span>)}
                </div>
              </div>
              <Pencil size={16} className="muted" aria-hidden="true" />
            </button>))}
          </div>
        )}
      </div>

      <div className="stack">
        <div className="row-between"><h2>{t('network.vehicles')}</h2>
          <button type="button" className="btn-sm" onClick={() => setVehicle({ capacity_cases: 100, active: true })}><Plus size={16} aria-hidden="true" />{t('network.addVehicle')}</button></div>
        {vehicles.isLoading ? <Skeleton rows={2} /> : (
          <div className="pack-grid">{vehicles.data?.map((v) => (
            <button key={v.id} type="button" className={`pack-card ${v.active ? '' : 'dim'}`} onClick={() => setVehicle(v)}>
              <div className="thumb" style={{ background: '#eff6ff', color: '#1d4ed8' }}><Truck size={26} aria-hidden="true" /></div>
              <div className="grow">
                <div className="cell-title">{v.name}</div>
                <div className="cell-sub">{v.reg_no ?? t('network.noReg')} · {t('network.cases', { n: v.capacity_cases })}</div>
              </div>
              {!v.active && <StatusBadge active={false} />}
              <Pencil size={16} className="muted" aria-hidden="true" />
            </button>))}
          </div>
        )}
      </div>

      <Sheet open={!!route} title={route?.id ? t('network.editRoute') : t('network.addRoute')} onClose={() => setRoute(null)}>
        {route && <RouteForm route={route} onDone={() => setRoute(null)} />}
      </Sheet>
      <Sheet open={!!vehicle} title={vehicle?.id ? t('network.editVehicle') : t('network.addVehicle')} onClose={() => setVehicle(null)}>
        {vehicle && <VehicleForm vehicle={vehicle} onDone={() => setVehicle(null)} />}
      </Sheet>
    </section>
  )
}

function RouteForm({ route, onDone }: { route: Partial<Route>; onDone: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [r, setR] = useState(route)
  const [error, setError] = useState<string | null>(null)
  const toggleDay = (d: number) => setR((x) => {
    const days = new Set(x.visit_days ?? [])
    if (days.has(d)) days.delete(d); else days.add(d)
    return { ...x, visit_days: [...days] }
  })
  const save = async (e: FormEvent) => {
    e.preventDefault(); setError(null)
    try {
      const row = { name: r.name?.trim(), visit_days: [...(r.visit_days ?? [])].sort(), active: r.active ?? true }
      await must(r.id ? supabase.from('route').update(row).eq('id', r.id).select() : supabase.from('route').insert(row).select())
      void qc.invalidateQueries({ queryKey: ['route'] }); onDone()
    } catch (err) { setError(errorMessage(t, err)) }
  }
  return (
    <form className="stack" onSubmit={save} noValidate>
      <label className="field"><span>{t('network.name')}</span>
        <input required maxLength={40} placeholder="Mon/Thu" value={r.name ?? ''} onChange={(e) => setR({ ...r, name: e.target.value })} /></label>
      <fieldset className="days"><legend>{t('network.visitDays')}</legend>
        {WEEKDAYS.map((d) => (
          <label key={d} className="day-toggle"><input type="checkbox" checked={r.visit_days?.includes(d) ?? false} onChange={() => toggleDay(d)} /><span>{t(`days.${d}`)}</span></label>
        ))}</fieldset>
      <label className="chip"><input type="checkbox" checked={r.active ?? true} onChange={(e) => setR({ ...r, active: e.target.checked })} />{t('users.active')}</label>
      <Alert msg={error ? { kind: 'error', text: error } : null} />
      <div className="sheet-foot">
        <button type="button" onClick={onDone}>{t('common.cancel')}</button>
        <button type="submit" className="primary" disabled={!r.name?.trim() || !r.visit_days?.length}>{t('common.save')}</button>
      </div>
    </form>
  )
}

function VehicleForm({ vehicle, onDone }: { vehicle: Partial<Vehicle>; onDone: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [v, setV] = useState(vehicle)
  const [error, setError] = useState<string | null>(null)
  const cap = Number(v.capacity_cases)
  const save = async (e: FormEvent) => {
    e.preventDefault(); setError(null)
    try {
      const row = { name: v.name?.trim(), reg_no: v.reg_no?.trim() || null, capacity_cases: cap, active: v.active ?? true }
      await must(v.id ? supabase.from('vehicle').update(row).eq('id', v.id).select() : supabase.from('vehicle').insert(row).select())
      void qc.invalidateQueries({ queryKey: ['vehicle'] }); onDone()
    } catch (err) { setError(errorMessage(t, err)) }
  }
  return (
    <form className="stack" onSubmit={save} noValidate>
      <label className="field"><span>{t('network.name')}</span>
        <input required maxLength={40} value={v.name ?? ''} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <div className="form-grid">
        <label className="field"><span>{t('network.regNo')}</span>
          <input maxLength={20} placeholder="MP 09 AB 1234" value={v.reg_no ?? ''} onChange={(e) => setV({ ...v, reg_no: e.target.value.toUpperCase() })} /></label>
        <label className="field"><span>{t('network.capacity')}</span>
          <input type="number" inputMode="numeric" min={1} max={5000} value={v.capacity_cases ?? ''} onChange={(e) => setV({ ...v, capacity_cases: Number(e.target.value) })} /></label>
      </div>
      <label className="chip"><input type="checkbox" checked={v.active ?? true} onChange={(e) => setV({ ...v, active: e.target.checked })} />{t('users.active')}</label>
      <Alert msg={error ? { kind: 'error', text: error } : null} />
      <div className="sheet-foot">
        <button type="button" onClick={onDone}>{t('common.cancel')}</button>
        <button type="submit" className="primary" disabled={!v.name?.trim() || !(cap >= 1 && cap <= 5000)}>{t('common.save')}</button>
      </div>
    </form>
  )
}
