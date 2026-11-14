import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, History, CheckCheck, ClipboardCheck, PackageCheck, PackageOpen, Plus, Printer, Receipt, Truck, Undo2, X } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { formatPaise } from '../../shared/money'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'
import { Pager } from '../../shared/ui/Pager'
import { usePaged } from '../../shared/ui/paging'
import { Stepper } from '../../shared/ui/Stepper'
import { useConfirm } from '../../shared/ui/confirm'
import { addDays, todayIST, useDrivers, useLocaleDate } from './opsData'
import { CounterSaleForm } from './CounterSaleForm'
import { refreshTrips, stageOf, useTripHistory, sumBy, useTripBoard, useTripDetail, type Stage, type TripCard, type TripDetail, type TripOrder } from './trips'

type Step = 'load' | 'unload' | 'bills' | 'close'
const STEPS: Step[] = ['load', 'unload', 'bills', 'close']
/** Revert one trip step through its RPC, with a confirm first. */
function useRevert() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  return { busy, run: async (fn: string, plan: string, title: string, body: string, ok: string, done: (m: Msg) => void) => {
    if (!(await confirm({ title, body, confirm: title, danger: true }))) return
    setBusy(true)
    try { await must(supabase.rpc(fn, { p_plan: plan })); refreshTrips(qc); done({ kind: 'success', text: ok }) }
    catch (e) { done({ kind: 'error', text: errorMessage(t, e) }) } finally { setBusy(false) }
  } }
}
const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.floor(n) || 0))

/** Loading: morning load, evening unload, parchis billed from the truck, then close. One trip per vehicle per day. */
export default function TripsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const today = todayIST()
  const date = params.get('date') ?? today
  const planId = params.get('trip')
  const history = params.get('view') === 'history'
  const [flash, setFlash] = useState<Msg>(null)
  const go = (next: Record<string, string | null>) => setParams((p) => {
    const q = new URLSearchParams(p)
    for (const [k, v] of Object.entries(next)) { if (v) q.set(k, v); else q.delete(k) }
    return q
  })

  if (planId) return <TripView key={planId} planId={planId} step={params.get('step') as Step | null}
    onStep={(s) => go({ step: s })} onBack={(m) => { setFlash(m ?? null); go({ trip: null, step: null }) }} />
  return (
    <section className="stack-lg">
      <PageHeader title={t('trip.title')} sub={t('trip.sub')} />
      <div className="segmented" role="tablist" aria-label={t('trip.day')}>
        {[-1, 0, 1].map((n) => { const d = addDays(today, n); return (
          <button key={d} type="button" role="tab" className="btn-sm" aria-selected={!history && date === d} onClick={() => { setFlash(null); go({ date: d === today ? null : d, view: null }) }}>
            {t(n < 0 ? 'trip.yesterday' : n > 0 ? 'trip.tomorrow' : 'trip.today')}</button>) })}
        <button type="button" role="tab" className="btn-sm" aria-selected={history} data-testid="trip-history-tab" onClick={() => { setFlash(null); go({ view: 'history', date: null }) }}>
          <History size={16} aria-hidden="true" />{t('trip.history.tab')}</button>
      </div>
      <Alert msg={flash} />
      {history ? <TripHistory onOpen={(id, d) => go({ trip: id, date: d, view: null, step: 'load' })} />
        : <Board date={date} onOpen={(id, step) => { setFlash(null); go({ trip: id, step }) }} />}
    </section>
  )
}

/** Loading history: every trip that was loaded, newest first, with who loaded it and when. Tap one to see its items. */
function TripHistory({ onOpen }: { onOpen: (planId: string, date: string) => void }) {
  const { t, i18n } = useTranslation()
  const fmt = useLocaleDate()
  const today = todayIST()
  const [from, setFrom] = useState(addDays(today, -30))
  const [to, setTo] = useState(today)
  const q = useTripHistory(from, to)
  const pg = usePaged(q.data ?? [], 15)
  const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : ''
  return (
    <div className="stack" data-testid="trip-history">
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <label className="field"><span>{t('trip.history.from')}</span><input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label className="field"><span>{t('trip.history.to')}</span><input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
      </div>
      {q.isLoading ? <Skeleton rows={5} /> : q.error ? <Alert msg={{ kind: 'error', text: errorMessage(t, q.error) }} />
        : !q.data?.length ? <Empty icon={<Truck size={24} />} title={t('trip.history.none')} /> : (
        <div className="table-wrap"><table className="table-stack"><tbody>{pg.rows.map((h) => {
          const stage = stageOf(h.status, h.unloaded_at)
          return (
            <tr key={h.id} className="clickable" onClick={() => onOpen(h.id, h.date)}>
              <td className="lead"><div className="row"><span className="avatar-sm" aria-hidden="true"><Truck size={16} /></span>
                <div><div className="cell-title">{h.vehicle ?? '—'} · {h.route}</div>
                  <div className="cell-sub">{fmt(h.date, true)}{h.loaded_by ? ` · ${t('trip.history.loadedBy', { who: h.loaded_by, at: time(h.loaded_at) })}` : ''}{h.driver ? ` · ${t('loading.driver')}: ${h.driver}` : ''}</div></div></div></td>
              <td><strong className="num">{h.loaded}</strong> <span className="cell-sub">{t('trip.history.cases', { n: h.items })}</span>
                {h.returned > 0 && <div className="cell-sub">{t('trip.history.back', { n: h.returned })}</div>}</td>
              <td><span className={`badge ${STAGE_LOOK[stage].badge}`}>{t(`trip.stage.${stage}`)}</span>
                {(h.short_cases ?? 0) > 0 && <div className="cell-sub" style={{ color: 'var(--danger, #dc2626)' }}>{t('trip.history.short', { n: h.short_cases })}</div>}</td>
              <td className="actions"><button type="button" className="btn-sm" onClick={(e) => { e.stopPropagation(); onOpen(h.id, h.date) }}>{t('trip.history.open')}</button></td>
            </tr>)
        })}</tbody></table><Pager p={pg} /></div>
      )}
    </div>
  )
}

const STAGE_LOOK: Record<Stage, { badge: string; tone: string }> = {
  load: { badge: '', tone: 'var(--line)' },
  onRoad: { badge: 'badge-amber', tone: '#f59e0b' },
  back: { badge: 'badge-blue', tone: '#3b82f6' },
  closed: { badge: 'badge-green', tone: 'var(--brand-600)' },
}

function Board({ date, onOpen }: { date: string; onOpen: (planId: string, step: Step) => void }) {
  const { t } = useTranslation()
  const board = useTripBoard(date)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const open = async (c: TripCard, step: Step) => {
    if (c.plan_id) { onOpen(c.plan_id, step); return }
    setBusy(c.vehicle_id); setErr(null)
    try { onOpen(await must<string>(supabase.rpc('trip_open', { p_vehicle: c.vehicle_id, p_date: date })), 'load') }
    catch (e) { setErr(errorMessage(t, e)) } finally { setBusy(null) }
  }

  if (board.isLoading) return <Skeleton rows={3} />
  if (board.isError) return <Alert msg={{ kind: 'error', text: errorMessage(t, board.error) }} />
  if (!board.data?.length) return <div className="card"><Empty icon={<Truck size={26} />} title={t('trip.noVehicles')}><p>{t('trip.noVehiclesHint')}</p></Empty></div>
  return (
    <>
      <Alert msg={err ? { kind: 'error', text: err } : null} />
      <ul className="plain-list trip-grid">
        {board.data.map((c) => {
          const stage = stageOf(c.status, c.unloaded_at)
          const short = stage === 'closed' && (c.short_cases ?? 0) > 0
          const look = STAGE_LOOK[stage]
          const action: { step: Step; label: string; icon: typeof Truck; primary?: boolean } =
            stage === 'load' ? { step: 'load', label: t('trip.startLoading', { v: c.vehicle }), icon: PackageOpen, primary: true }
            : stage === 'onRoad' ? { step: 'unload', label: t('trip.truckBack'), icon: Undo2, primary: true }
            : stage === 'back' ? { step: c.left > 0 ? 'bills' : 'close', label: c.left > 0 ? t('trip.continueBilling') : t('trip.closeTrip'), icon: c.left > 0 ? Receipt : ClipboardCheck, primary: true }
            : { step: 'close', label: t('trip.viewTrip'), icon: ClipboardCheck }
          return (
            <li key={c.vehicle_id} className="card stack trip-card" data-testid="trip-card" data-stage={stage}
              style={{ borderTop: `4px solid ${short ? 'var(--danger)' : look.tone}` }}>
              <div className="row-between">
                <div className="row"><Truck size={20} aria-hidden="true" /><div>
                  <div className="cell-title">{c.vehicle}</div>
                  <div className="cell-sub">{[c.route, c.driver].filter(Boolean).join(' · ') || t('trip.notStarted')}</div></div></div>
                <span className={`badge ${short ? 'badge-red' : look.badge}`}>{short ? t('trip.closedShort', { n: c.short_cases }) : t(`trip.stage.${stage}`)}</span>
              </div>
              {stage === 'load' ? (
<>
                <p className="cell-sub">{c.orders ? t('trip.ordersWaiting', { count: c.orders, cases: c.ordered_cases }) : t('trip.noOrders')}</p>
                {(c.carry ?? 0) > 0 && <p className="cell-sub text-warn" data-testid="card-carry"><Truck size={14} aria-hidden="true" /> {t('trip.carry.card', { n: c.carry })}</p>}
                </>
              ) : (
                <>
                  <div className="trip-nums">
                    <div><span>{t('trip.loaded')}</span><strong className="num">{c.loaded}<small> / {c.capacity}</small></strong></div>
                    <div><span>{t('trip.sold')}</span><strong className="num">{c.sold}</strong></div>
                    <div><span>{t('trip.cameBack')}</span><strong className="num">{c.returned}</strong></div>
                    <div><span>{t('trip.left')}</span><strong className={`num ${c.left > 0 && stage !== 'onRoad' ? 'text-warn' : ''}`}>{c.left}</strong></div>
                  </div>
                  <div className="row-between cell-sub"><span>{t('trip.sales')}</span><strong className="num">{formatPaise(c.sales_paise)}</strong></div>
                  {(c.kept ?? 0) > 0 && <p className="cell-sub" data-testid="card-kept"><Truck size={14} aria-hidden="true" /> {t('trip.carry.cardKept', { n: c.kept })}</p>}
                  {short && c.close_note && <p className="cell-sub text-danger">{t('trip.reasonWas', { r: c.close_note })}</p>}
                </>
              )}
              <button type="button" className={action.primary ? 'primary btn-block' : 'btn-block'} disabled={busy === c.vehicle_id} onClick={() => void open(c, action.step)}>
                <action.icon size={18} aria-hidden="true" />{busy === c.vehicle_id ? t('common.loading') : action.label}</button>
            </li>)
        })}
      </ul>
    </>
  )
}

function TripView({ planId, step, onStep, onBack }: { planId: string; step: Step | null; onStep: (s: Step) => void; onBack: (m?: Msg) => void }) {
  const { t } = useTranslation()
  const fmt = useLocaleDate()
  const q = useTripDetail(planId)
  const [msg, setMsg] = useState<Msg>(null)
  if (q.isLoading) return <Skeleton rows={6} />
  if (q.isError || !q.data) return <section className="stack-lg"><button type="button" className="btn-sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => onBack()}><ArrowLeft size={16} aria-hidden="true" />{t('trip.allVehicles')}</button>
    <Alert msg={{ kind: 'error', text: errorMessage(t, q.error) }} /></section>
  const d = q.data
  const stage = stageOf(d.plan.status, d.plan.unloaded_at)
  const left = sumBy(d.items, (i) => Math.max(0, i.left))
  const fallback: Step = stage === 'load' ? 'load' : stage === 'onRoad' ? 'unload' : stage === 'back' ? (left > 0 ? 'bills' : 'close') : 'close'
  const cur = step && STEPS.includes(step) ? step : fallback
  const loaded = sumBy(d.items, (i) => i.loaded)
  const done: Record<Step, boolean> = { load: stage !== 'load', unload: !!d.plan.unloaded_at, bills: stage !== 'load' && left === 0, close: stage === 'closed' }
  const vehicle = d.plan.vehicle ?? '—'

  return (
    <section className="stack-lg trip-view">
      <div className="stack" style={{ gap: 6 }}>
        <button type="button" className="btn-sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => onBack()}><ArrowLeft size={16} aria-hidden="true" />{t('trip.allVehicles')}</button>
        <PageHeader title={<span className="row"><Truck size={24} aria-hidden="true" />{vehicle}</span>}
          sub={[fmt(d.plan.date, true), d.plan.route, d.plan.driver].filter(Boolean).join(' · ')} />
      </div>
      <nav className="trip-steps" aria-label={t('trip.steps')}>
        {STEPS.map((s, i) => (
          <button key={s} type="button" aria-current={cur === s ? 'step' : undefined} className={done[s] ? 'done' : ''} onClick={() => { setMsg(null); onStep(s) }}>
            <span className="dot" aria-hidden="true">{done[s] ? <Check size={14} /> : i + 1}</span><span>{t(`trip.step.${s}`)}</span></button>))}
      </nav>
      {loaded > 0 && cur !== 'load' && <TruckCounts d={d} />}
      <Alert msg={msg} />
      {cur === 'load' && <LoadStep d={d} onDone={(m) => onBack(m)} />}
      {cur === 'unload' && <UnloadStep d={d} onDone={(m) => { setMsg(m); onStep('bills') }} />}
      {cur === 'bills' && <BillsStep d={d} onGoClose={() => onStep('close')} />}
      {cur === 'close' && <CloseStep d={d} onUnload={() => onStep('unload')} onBills={() => onStep('bills')} onDone={(m) => onBack(m)} />}
    </section>
  )
}

/** Running totals for the truck: what went out and where it went. */
function TruckCounts({ d }: { d: TripDetail }) {
  const { t } = useTranslation()
  const n = (f: (i: TripDetail['items'][number]) => number) => sumBy(d.items, f)
  const left = n((i) => Math.max(0, i.left))
  return (
    <div className="stats" data-testid="truck-counts">
      <div className="stat"><div className="label">{t('trip.loaded')}</div><div className="value num">{n((i) => i.loaded)}</div></div>
      <div className="stat"><div className="label">{t('trip.billedDelivered')}</div><div className="value num">{n((i) => i.billed + i.delivered)}</div></div>
      <div className="stat"><div className="label">{t('trip.cameBack')}</div><div className="value num">{n((i) => i.returned)}</div></div>
      {/* before unload it is stock still on the truck; after unload nothing is on the truck, it is sold with the parchi not entered yet */}
      <div className="stat"><div className="label">{t(d.plan.unloaded_at ? 'trip.parchiDue' : 'trip.onTruckNow')}</div>
        <div className="value num" style={left > 0 ? { color: 'var(--warn)' } : undefined} data-testid="left-total">{left}</div>
        {d.plan.unloaded_at && left > 0 && <div className="cell-sub">{t('trip.parchiDueSub')}</div>}</div>
    </div>
  )
}

// ---------------------------------------------------------------- load
function LoadStep({ d, onDone }: { d: TripDetail; onDone: (m: Msg) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const drivers = useDrivers()
  const fmt = useLocaleDate()
  const isLoaded = d.plan.status === 'loaded'
  const started = d.plan.status !== 'planning' && (d.plan.status !== 'loaded' || !!d.plan.unloaded_at || d.items.some((i) => i.billed || i.delivered || i.returned))
  // What the godown can give: its stock, plus what is on the truck now when the load is being changed.
  // Leftover still on this truck from its last trip: the loader confirms the count before loading.
  const carryItems = isLoaded ? [] : d.items.filter((i) => (i.carry ?? 0) > 0)
  const [carryOk, setCarryOk] = useState<Record<string, number>>(() => Object.fromEntries(carryItems.map((i) => [i.variant_id, i.carry ?? 0])))
  const [carryChecked, setCarryChecked] = useState(false)
  const onTruck = (i: TripDetail['items'][number]) => carryOk[i.variant_id] ?? 0
  const cap = (i: TripDetail['items'][number]) => i.godown + (isLoaded ? i.loaded : onTruck(i))
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(d.items.map((i) => {
    const c = isLoaded ? 0 : (i.carry ?? 0)
    return [i.variant_id, isLoaded ? i.loaded : c + Math.min(Math.max(0, i.ordered - c), i.godown)]
  })))
  const [driver, setDriver] = useState(d.plan.driver_id ?? '')
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [editing, setEditing] = useState(!isLoaded)
  const revert = useRevert()

  const brands = useMemo(() => [...new Set(d.items.map((i) => i.brand).filter(Boolean) as string[])].sort(), [d.items])
  const total = Object.values(qty).reduce((a, n) => a + n, 0)
  const capacity = d.plan.capacity ?? 0
  const pct = capacity ? Math.min(100, Math.round((total / capacity) * 100)) : 0
  const ql = q.trim().toLowerCase()
  const rows = d.items.filter((i) => (!brand || (brand === '__in' ? (qty[i.variant_id] ?? 0) > 0 : i.brand === brand)) && (!ql || i.label.toLowerCase().includes(ql)))
    // Ordered and already-loaded items first, then what is in the godown. Uses saved data, so rows never jump while tapping.
    .sort((a, b) => Number(b.ordered > 0 || b.loaded > 0) - Number(a.ordered > 0 || a.loaded > 0) || Number(cap(b) > 0) - Number(cap(a) > 0))
  const shortForOrders = d.items.filter((i) => i.ordered > (qty[i.variant_id] ?? 0))

  const save = async () => {
    if (shortForOrders.length && !(await confirm({ title: t('trip.load.shortTitle'), body: t('trip.load.shortBody', { n: shortForOrders.length }), confirm: t('trip.load.loadAnyway') }))) return
    setBusy(true); setMsg(null)
    try {
      await must(supabase.rpc('trip_load', { p_plan: d.plan.id, p_driver: driver || null,
        p_lines: Object.entries(qty).filter(([, n]) => n > 0).map(([variant_id, n]) => ({ variant_id, qty: n })),
        p_carry: carryItems.length ? carryItems.map((i) => ({ variant_id: i.variant_id, qty: onTruck(i) })) : null }))
      refreshTrips(qc)
      onDone({ kind: 'success', text: t('trip.load.done', { v: d.plan.vehicle, n: total }) })
    } catch (e) { setMsg({ kind: 'error', text: errorMessage(t, e) }) } finally { setBusy(false) }
  }

  if (started || (isLoaded && !editing)) {
    const items = d.items.filter((i) => i.loaded > 0)
    return (
      <div className="stack-lg trip-printable">
        <Alert msg={{ kind: 'success', text: t('trip.load.loadedNote', { v: d.plan.vehicle, n: sumBy(items, (i) => i.loaded) }) }} />
        <div className="card card-flush"><ul className="plain-list trip-list">{items.map((i) => (
          <li key={i.variant_id}><span className="grow">{i.label}</span><strong className="num">{i.loaded}</strong></li>))}</ul></div>
        <Alert msg={msg} />
        {started && <p className="cell-sub">{t('trip.load.lockedHint')}</p>}
        <div className="row no-print" style={{ gap: 8, flexWrap: 'wrap' }}>
          {!started && <button type="button" onClick={() => setEditing(true)}>{t('trip.load.change')}</button>}
          {!started && <button type="button" className="danger" disabled={revert.busy} data-testid="undo-load"
            onClick={() => void revert.run('trip_undo_load', d.plan.id, t('trip.revert.load'), t('trip.revert.loadBody', { v: d.plan.vehicle, n: sumBy(items, (i) => i.loaded) }), t('trip.revert.loadDone', { v: d.plan.vehicle }), (m) => (m?.kind === 'error' ? setMsg(m) : onDone(m)))}>
            <Undo2 size={18} aria-hidden="true" />{t('trip.revert.load')}</button>}
          <button type="button" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />{t('loading.print')}</button>
        </div>
        {/* Printed for the helpers: what goes on the truck, then each advance order. */}
        <div className="print-sheet" aria-hidden="true">
          <p style={{ margin: 0, fontWeight: 700 }}>{t('app.name')} · 9630012636</p>
          <h1>{d.plan.vehicle} · {d.plan.date} · {d.plan.route}</h1>
          <p>{t('loading.driver')}: {d.plan.driver ?? '—'} · {t('loading.onTruck')}: {sumBy(items, (i) => i.loaded)}</p>
          <table><thead><tr><th>{t('loading.item')}</th><th>{t('loading.total')}</th><th>✓</th></tr></thead>
            <tbody>{items.map((i) => <tr key={i.variant_id}><td>{i.label}</td><td><b>{i.loaded}</b></td><td></td></tr>)}</tbody></table>
          {d.orders.length > 0 && <>
            <h2>{t('loading.stopsTitle')}</h2>
            <table><thead><tr><th>{t('shops.name')}</th><th>{t('loading.items')}</th><th>{t('shop.total')}</th></tr></thead>
              <tbody>{d.orders.map((o) => <tr key={o.id}><td>{o.shop}{o.phone ? <><br />{o.phone}</> : null}</td>
                <td>{o.lines.map((l) => `${l.label} × ${l.qty}`).join(', ')}</td><td>{formatPaise(o.total_paise)}</td></tr>)}</tbody></table></>}
          <p style={{ marginTop: '10mm' }}>{t('loading.driver')}: ____________________ &nbsp; {t('loading.signLoaded')}: ____________________</p>
        </div>
      </div>
    )
  }
  const carryTotal = sumBy(carryItems, onTruck)
  const releaseCarry = async () => {
    if (!d.plan.vehicle_id || !(await confirm({ title: t('trip.carry.release'), body: t('trip.carry.releaseBody', { n: sumBy(carryItems, (i) => i.carry ?? 0) }), confirm: t('trip.carry.release') }))) return
    setBusy(true); setMsg(null)
    try { await must(supabase.rpc('truck_carry_release', { p_vehicle: d.plan.vehicle_id })); refreshTrips(qc) }
    catch (e) { setMsg({ kind: 'error', text: errorMessage(t, e) }) } finally { setBusy(false) }
  }
  return (
    <div className="stack-lg">
      {carryItems.length > 0 && (
        <div className="card stack carry-card" data-testid="carry-card">
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div><div className="cell-title">{t('trip.carry.title', { n: sumBy(carryItems, (i) => i.carry ?? 0) })}</div>
              <div className="cell-sub">{t('trip.carry.sub', { date: d.plan.carry_date ? fmt(d.plan.carry_date, true) : '' })}</div></div>
            <button type="button" className="btn-sm" disabled={busy} onClick={() => void releaseCarry()}>{t('trip.carry.release')}</button>
          </div>
          <ul className="plain-list trip-list">{carryItems.map((i) => (
            <li key={i.variant_id} data-testid="carry-row"><div className="grow"><div className="cell-title">{i.label}</div>
              {onTruck(i) < (i.carry ?? 0) && <div className="cell-sub text-warn">{t('trip.carry.missing', { n: (i.carry ?? 0) - onTruck(i) })}</div>}</div>
              <Stepper value={onTruck(i)} max={i.carry ?? 0} showZero label={`${t('trip.carry.onTruck')}: ${i.label}`}
                onChange={(v) => { const n = clamp(v, i.carry ?? 0); setCarryOk((s) => ({ ...s, [i.variant_id]: n })); setCarryChecked(false)
                  setQty((s) => ({ ...s, [i.variant_id]: Math.min(s[i.variant_id] ?? 0, i.godown + n) })) }} />
            </li>))}</ul>
          <label className="chip"><input type="checkbox" checked={carryChecked} onChange={(e) => setCarryChecked(e.target.checked)} data-testid="carry-ok" />
            {t('trip.carry.confirm', { n: carryTotal })}</label>
        </div>)}
      {d.orders.length > 0 && <Alert msg={{ kind: 'success', text: t('trip.load.prefilled', { count: d.orders.length }) }} />}
      <label className="field" style={{ maxWidth: 360 }}><span>{t('trip.load.driver')}</span>
        <select value={driver} onChange={(e) => setDriver(e.target.value)}>
          <option value="">{t('trip.load.noDriver')}</option>
          {drivers.data?.map((x) => <option key={x.user_id} value={x.user_id}>{x.name}</option>)}
        </select></label>
      <div className="stack" style={{ gap: 10 }}>
        <label className="field"><span className="sr-only">{t('trip.load.search')}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('trip.load.search')} aria-label={t('trip.load.search')} /></label>
        <div className="segmented" role="tablist" aria-label={t('trip.load.filter')}>
          <button type="button" role="tab" className="btn-sm" aria-selected={!brand} onClick={() => setBrand('')}>{t('trip.load.all')}</button>
          <button type="button" role="tab" className="btn-sm" aria-selected={brand === '__in'} onClick={() => setBrand('__in')}>{t('trip.load.inLoad', { n: Object.values(qty).filter((n) => n > 0).length })}</button>
          {brands.map((b) => <button key={b} type="button" role="tab" className="btn-sm" aria-selected={brand === b} onClick={() => setBrand(b)}>{b}</button>)}
        </div>
      </div>
      <div className="card card-flush">
        <ul className="plain-list trip-list">
          {rows.map((i) => {
            const n = qty[i.variant_id] ?? 0, max = cap(i)
            return (
              <li key={i.variant_id} className={max === 0 && n === 0 ? 'dim' : ''} data-testid="load-row">
                <div className="grow">
                  <div className="cell-title">{i.label}</div>
                  <div className="cell-sub num">{onTruck(i) > 0 ? t('trip.carry.rowSub', { t: onTruck(i), g: i.godown }) : t('trip.load.godown', { n: max })}{i.ordered > 0 && <> · <span className={i.ordered > n ? 'text-warn' : 'text-ok'}>{t('trip.load.ordered', { n: i.ordered })}</span></>}</div>
                </div>
                {max === 0 && n === 0 ? <span className="badge">{t('trip.load.noStock')}</span>
                  : <Stepper value={n} max={max} label={i.label} onChange={(v) => setQty((s) => ({ ...s, [i.variant_id]: clamp(v, max) }))} />}
              </li>)
          })}
          {!rows.length && <li className="muted">{t('common.noMatches')}</li>}
        </ul>
      </div>
      <Alert msg={msg} />
      <div className="trip-bar" data-testid="load-bar">
        <div className="grow">
          <strong className="num">{t('trip.load.cases', { n: total })}{capacity ? <small> / {capacity}</small> : null}</strong>
          {capacity > 0 && <div className={`bar${total > capacity ? ' bar-over' : ''}`} role="progressbar" aria-label={t('trip.load.space')} aria-valuenow={total} aria-valuemin={0} aria-valuemax={capacity}><i style={{ width: `${pct}%` }} /></div>}
          {total > capacity && capacity > 0 && <span className="cell-sub">{t('trip.load.over', { n: total - capacity })}</span>}
        </div>
        {isLoaded && <button type="button" onClick={() => setEditing(false)}>{t('common.cancel')}</button>}
        {carryItems.length > 0 && !carryChecked && <span className="cell-sub text-warn">{t('trip.carry.checkFirst')}</span>}
        <button type="button" className="primary" disabled={busy || total === 0 || (carryItems.length > 0 && !carryChecked)} onClick={() => void save()}>
          <PackageCheck size={18} aria-hidden="true" />{busy ? t('common.loading') : isLoaded ? t('trip.load.saveChange') : t('trip.load.loadBtn', { v: d.plan.vehicle })}</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- unload
function UnloadStep({ d, onDone }: { d: TripDetail; onDone: (m: Msg) => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const items = d.items.filter((i) => i.loaded > 0)
  const maxBack = (i: TripDetail['items'][number]) => Math.max(0, i.loaded - i.delivered - i.billed)
  const [back, setBack] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.variant_id, i.returned])))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const closed = d.plan.status === 'closed'
  const revert = useRevert()
  // Our own truck: what came back stays on it for its next trip (default), or goes into the godown.
  const canKeep = !!d.plan.vehicle_id
  const [keep, setKeep] = useState(d.plan.unloaded_at ? !!d.plan.kept : true)

  if (d.plan.status === 'planning') return <div className="card"><Empty icon={<PackageOpen size={26} />} title={t('trip.unload.notLoaded')} /></div>
  const totalBack = Object.values(back).reduce((a, n) => a + n, 0)
  const sold = sumBy(items, (i) => i.delivered + i.billed)
  const loaded = sumBy(items, (i) => i.loaded)
  const toBill = loaded - sold - totalBack
  const allBack = items.every((i) => (back[i.variant_id] ?? 0) === maxBack(i))

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      await must(supabase.rpc('trip_unload', { p_plan: d.plan.id, p_returned: items.map((i) => ({ variant_id: i.variant_id, qty: back[i.variant_id] ?? 0 })), p_keep: canKeep && keep }))
      refreshTrips(qc)
      const kept = canKeep && keep && totalBack > 0
      onDone({ kind: 'success', text: (toBill > 0 ? t('trip.unload.doneBill', { n: totalBack, b: toBill }) : t('trip.unload.done', { n: totalBack })) + (kept ? ' ' + t('trip.carry.keptNote', { n: totalBack }) : '') })
    } catch (e) { setMsg({ kind: 'error', text: errorMessage(t, e) }) } finally { setBusy(false) }
  }

  const savedBack = d.items.reduce((a, i) => a + i.returned, 0)
  const at = d.plan.unloaded_at ? new Date(d.plan.unloaded_at).toLocaleTimeString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : ''
  return (
    <div className="stack-lg">
      {d.plan.unloaded_at
        ? <Alert msg={{ kind: 'success', text: t('trip.unload.savedNote', { at, who: '', n: savedBack }) }} />
        : <p className="muted">{t('trip.unload.hint')}</p>}
      {!closed && <button type="button" style={{ alignSelf: 'flex-start' }} onClick={() => setBack(Object.fromEntries(items.map((i) => [i.variant_id, allBack ? 0 : maxBack(i)])))}>
        <CheckCheck size={18} aria-hidden="true" />{allBack ? t('trip.unload.none') : t('trip.unload.allBack')}</button>}
      <div className="card card-flush">
        <ul className="plain-list trip-list">{items.map((i) => {
          const max = maxBack(i), n = back[i.variant_id] ?? 0
          return (
            <li key={i.variant_id} data-testid="unload-row">
              <div className="grow">
                <div className="cell-title">{i.label}</div>
                {/* sold = what went out minus what came back (parchis for it are entered in the next step) */}
                <div className="cell-sub num">{t('trip.unload.rowSub', { l: i.loaded })} · <b>{t('trip.unload.rowSold', { b: n, s: Math.max(0, i.loaded - n) })}</b>
                  {i.delivered + i.billed > 0 ? t('trip.unload.rowBilled', { p: i.delivered + i.billed }) : ''}</div>
              </div>
              {closed ? <strong className="num">{n}</strong>
                : <Stepper value={n} max={max} showZero label={`${t('trip.cameBack')}: ${i.label}`} disabled={max === 0} onChange={(v) => setBack((s) => ({ ...s, [i.variant_id]: clamp(v, max) }))} />}
            </li>)
        })}</ul>
      </div>
      <div className="card stack" style={{ gap: 6 }} data-testid="unload-summary">
        <div className="row-between"><span>{t('trip.loaded')}</span><strong className="num">{loaded}</strong></div>
        <div className="row-between"><span>{t('trip.billedDelivered')}</span><strong className="num">− {sold}</strong></div>
        <div className="row-between"><span>{t('trip.cameBack')}</span><strong className="num">− {totalBack}</strong></div>
        <div className="row-between total-row"><span>{t('trip.unload.parchisToEnter')}</span><strong className={`num ${toBill > 0 ? 'text-warn' : 'text-ok'}`}>{toBill}</strong></div>
      </div>
      <Alert msg={msg} />
      {!closed && d.plan.unloaded_at && <button type="button" className="danger btn-sm" style={{ alignSelf: 'flex-start' }} disabled={revert.busy || busy} data-testid="undo-unload" title={t('trip.unload.undoHint')}
        onClick={() => void revert.run('trip_undo_unload', d.plan.id, t('trip.revert.unload'), t('trip.revert.unloadBody', { n: savedBack }), t('trip.revert.unloadDone'), setMsg)}>{t('trip.revert.unload')}</button>}
      {!closed && canKeep && totalBack > 0 && (
        <div className="segmented" role="radiogroup" aria-label={t('trip.carry.where')} data-testid="keep-choice">
          <button type="button" role="radio" className="btn-sm" aria-checked={keep} aria-selected={keep} onClick={() => setKeep(true)}>
            <Truck size={16} aria-hidden="true" />{t('trip.carry.keep')}</button>
          <button type="button" role="radio" className="btn-sm" aria-checked={!keep} aria-selected={!keep} onClick={() => setKeep(false)}>
            <PackageOpen size={16} aria-hidden="true" />{t('trip.carry.toGodown')}</button>
        </div>)}
      {!closed && <div className="trip-bar trip-bar-compact">
        <div className="grow"><strong className="num">{t('trip.unload.backCount', { n: totalBack })}</strong><span className="cell-sub">{canKeep && keep ? t('trip.carry.keepHint') : t('trip.unload.toGodown')}</span></div>
        <button type="button" className="primary" disabled={busy} onClick={() => void save()}><Undo2 size={18} aria-hidden="true" />
          {busy ? t('common.loading') : d.plan.unloaded_at ? t('trip.unload.saveFix') : canKeep && keep ? t('trip.unload.btnKeep', { n: totalBack }) : t('trip.unload.btn', { n: totalBack })}</button>
      </div>}
    </div>
  )
}

// ---------------------------------------------------------------- bills
function BillsStep({ d, onGoClose }: { d: TripDetail; onGoClose: () => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [selling, setSelling] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [saved, setSaved] = useState<Msg>(null)
  const [msg, setMsg] = useState<Msg>(null)
  const [delivering, setDelivering] = useState<TripOrder | null>(null)
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'
  const out = d.plan.status === 'loaded' || d.plan.status === 'out'
  const left = sumBy(d.items, (i) => Math.max(0, i.left))
  const pgBills = usePaged(d.bills, 20)
  const pending = d.orders.filter((o) => o.status === 'placed' || o.status === 'locked')
  const doneOrders = d.orders.filter((o) => o.status === 'delivered' || o.status === 'partially_delivered')

  const notDelivered = async (o: TripOrder) => {
    if (!(await confirm({ title: t('trip.bills.notDeliveredTitle'), body: t('trip.bills.notDeliveredBody', { shop: o.shop }), confirm: t('trip.bills.notDelivered'), danger: true }))) return
    try {
      await must(supabase.rpc('record_delivery', { p_action_id: crypto.randomUUID(), p_plan_id: d.plan.id, p_shop_id: o.shop_id, p_payment: null,
        p_lines: o.lines.map((l) => ({ variant_id: l.variant_id, qty: 0, reason: 'shop_closed' })) }))
      refreshTrips(qc); setMsg({ kind: 'success', text: t('trip.bills.markedNot', { shop: o.shop }) })
    } catch (e) { setMsg({ kind: 'error', text: errorMessage(t, e) }) }
  }

  if (d.plan.status === 'planning') return <div className="card"><Empty icon={<PackageOpen size={26} />} title={t('trip.unload.notLoaded')} /></div>
  return (
    <div className="stack-lg">
      <div className="card stack" data-testid="bill-progress">
        <div className="row-between">
          <strong>{left > 0 ? t('trip.bills.leftToBill', { n: left }) : t('trip.bills.allBilled')}</strong>
          {out && <button type="button" className="primary" disabled={left === 0} onClick={() => { setSaved(null); setFormKey((k) => k + 1); setSelling(true) }}>
            <Plus size={18} aria-hidden="true" />{t('trip.bills.newSale', { v: d.plan.vehicle })}</button>}
        </div>
        {left > 0 && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{d.items.filter((i) => i.left > 0).map((i) => <span key={i.variant_id} className="badge badge-amber">{i.label}: {i.left}</span>)}</div>}
        {left === 0 && out && <button type="button" style={{ alignSelf: 'flex-start' }} onClick={onGoClose}><ClipboardCheck size={18} aria-hidden="true" />{t('trip.closeTrip')}</button>}
      </div>
      <Alert msg={msg} />

      {d.orders.length > 0 && (
        <div className="stack">
          <h2>{t('trip.bills.orders', { n: d.orders.length })}</h2>
          <ul className="plain-list stack">
            {[...pending, ...doneOrders].map((o) => {
              const isDone = o.status === 'delivered' || o.status === 'partially_delivered'
              return (
                <li key={o.id} className={`card stack ${isDone ? 'dim' : ''}`} data-testid="trip-order">
                  <div className="row-between">
                    <div><div className="cell-title">{o.shop}{o.owner ? ` · ${o.owner}` : ''}</div>
                      <div className="cell-sub">{o.lines.map((l) => `${l.label} × ${l.qty}`).join(', ')}</div></div>
                    <div style={{ textAlign: 'right' }}><strong className="num">{formatPaise(isDone ? o.delivered_paise : o.total_paise)}</strong>
                      {isDone && <div><span className="badge badge-green">{t(o.status === 'delivered' ? 'trip.bills.delivered' : 'trip.bills.partly')}</span></div>}</div>
                  </div>
                  {!isDone && out && (
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn-sm primary" onClick={() => setDelivering(o)}><Check size={16} aria-hidden="true" />{t('trip.bills.deliveredBtn')}</button>
                      <button type="button" className="btn-sm" onClick={() => setDelivering(o)}>{t('trip.bills.change')}</button>
                      <button type="button" className="btn-sm danger" onClick={() => void notDelivered(o)}><X size={16} aria-hidden="true" />{t('trip.bills.notDelivered')}</button>
                    </div>)}
                </li>)
            })}
          </ul>
        </div>
      )}

      <div className="stack">
        <h2>{t('trip.bills.title', { n: d.bills.length })}</h2>
        {d.bills.length === 0 ? <p className="muted">{t('trip.bills.none')}</p> : (
          <ul className="plain-list stack">{pgBills.rows.map((b) => (
            <li key={b.id} className="card row-between" data-testid="trip-bill">
              <div><div className="cell-title">{b.number} · {b.shop}{b.owner ? ` · ${b.owner}` : ''}</div>
                <div className="cell-sub">{new Date(b.at).toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' })} · {t('trip.load.cases', { n: b.cases })}</div></div>
              <div style={{ textAlign: 'right' }}><strong className="num">{formatPaise(b.total_paise)}</strong>{' '}
                <span className={`badge ${b.mode === 'upi' ? 'badge-blue' : 'badge-green'}`}>{b.mode === 'upi' ? 'UPI' : t('driver.cash')}</span></div>
            </li>))}</ul>)}
        <Pager p={pgBills} />
        {d.bills.length > 0 && <p className="cell-sub">{t('trip.bills.editHint')}</p>}
      </div>

      <Sheet open={selling} wide title={t('trip.bills.newSale', { v: d.plan.vehicle })} onClose={() => setSelling(false)}>
        {selling && <div className="stack">
          <Alert msg={saved} />
          <CounterSaleForm key={formKey} planId={d.plan.id} vehicle={d.plan.vehicle ?? undefined} onDone={(number) => {
            if (!number) { setSelling(false); return }
            refreshTrips(qc)
            setSaved({ kind: 'success', text: t('trip.bills.saved', { n: number }) })
            setFormKey((k) => k + 1)
          }} />
        </div>}
      </Sheet>
      <Sheet open={!!delivering} wide title={delivering ? `${delivering.shop}${delivering.owner ? ` · ${delivering.owner}` : ''}` : ''} onClose={() => setDelivering(null)}>
        {delivering && <DeliverForm key={delivering.id} order={delivering} planId={d.plan.id} onDone={(m) => { setDelivering(null); if (m) setMsg(m) }} />}
      </Sheet>
    </div>
  )
}

/** An advance order handed over from the truck: quantities as delivered, and how the shop paid. */
function DeliverForm({ order, planId, onDone }: { order: TripOrder; planId: string; onDone: (m?: Msg) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [action] = useState(() => crypto.randomUUID())
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(order.lines.map((l) => [l.variant_id, l.qty])))
  const [pay, setPay] = useState<'cash' | 'upi' | 'credit'>('cash')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('shop_refused')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const total = order.lines.reduce((a, l) => a + (qty[l.variant_id] ?? 0) * l.price_paise, 0)
  const short = order.lines.some((l) => (qty[l.variant_id] ?? 0) < l.qty)
  const paid = pay === 'credit' ? 0 : amount.trim() === '' ? total : Math.round(Number(amount) * 100)
  const badPaid = pay !== 'credit' && (!Number.isFinite(paid) || paid < 0 || paid > total)

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      await must(supabase.rpc('record_delivery', { p_action_id: action, p_plan_id: planId, p_shop_id: order.shop_id,
        p_payment: paid > 0 ? { mode: pay, amount_paise: paid } : null,
        p_lines: order.lines.map((l) => ({ variant_id: l.variant_id, qty: qty[l.variant_id] ?? 0, reason: (qty[l.variant_id] ?? 0) < l.qty ? reason : null })) }))
      refreshTrips(qc)
      onDone({ kind: 'success', text: t('trip.bills.deliverDone', { shop: order.shop, total: formatPaise(total) }) })
    } catch (e) { setMsg({ kind: 'error', text: errorMessage(t, e) }) } finally { setBusy(false) }
  }

  return (
    <div className="stack-lg">
      <ul className="plain-list">{order.lines.map((l) => (
        <li key={l.variant_id} className="cart-line">
          <div className="grow"><div className="cell-title">{l.label}</div><div className="cell-sub num">{t('trip.load.ordered', { n: l.qty })} · {formatPaise(l.price_paise)}</div></div>
          <Stepper value={qty[l.variant_id] ?? 0} max={999} label={l.label} onChange={(v) => setQty((s) => ({ ...s, [l.variant_id]: clamp(v, 999) }))} />
        </li>))}</ul>
      {short && <label className="field"><span>{t('trip.bills.whyLess')}</span>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {['shop_refused', 'out_of_stock', 'damaged', 'shop_closed', 'other'].map((r) => <option key={r} value={r}>{t(`trip.reasons.${r}`)}</option>)}
        </select></label>}
      <fieldset className="days"><legend className="cell-title" style={{ marginBottom: 6 }}>{t('sales.form.pay')}</legend>
        {(['cash', 'upi', 'credit'] as const).map((m) => <label key={m} className="day-toggle"><input type="radio" name="dl-pay" checked={pay === m} onChange={() => setPay(m)} />
          <span>{m === 'cash' ? t('driver.cash') : m === 'upi' ? 'UPI' : t('trip.bills.udhaar')}</span></label>)}
      </fieldset>
      {pay !== 'credit' && <label className="field" style={{ maxWidth: 220 }}><span>{t('trip.bills.amountPaid')}</span>
        <input type="number" inputMode="decimal" min={0} value={amount} placeholder={String(total / 100)} aria-invalid={badPaid} onChange={(e) => setAmount(e.target.value)} /></label>}
      {pay !== 'credit' && paid < total && !badPaid && <p className="cell-sub">{t('trip.bills.restUdhaar', { r: formatPaise(total - paid) })}</p>}
      <div className="row-between total-row"><span>{t('shop.total')}</span><strong className="num">{formatPaise(total)}</strong></div>
      <Alert msg={msg} />
      <div className="sheet-foot">
        <button type="button" onClick={() => onDone()}>{t('common.cancel')}</button>
        <button type="button" className="primary" disabled={busy || badPaid} onClick={() => void save()}><Check size={18} aria-hidden="true" />{busy ? t('common.loading') : t('trip.bills.confirmDeliver')}</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- close
function CloseStep({ d, onUnload, onBills, onDone }: { d: TripDetail; onUnload: () => void; onBills: () => void; onDone: (m: Msg) => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'
  const short = d.items.filter((i) => i.left > 0)
  const left = sumBy(short, (i) => i.left)
  const sales = sumBy(d.bills, (b) => b.total_paise) + sumBy(d.orders, (o) => o.delivered_paise)
  const revert = useRevert()

  if (d.plan.status === 'closed') {
    const s = d.plan.short_cases ?? 0
    return (
      <div className="card stack" data-testid="trip-closed">
        <Alert msg={s > 0 ? { kind: 'error', text: t('trip.close.closedShort', { n: s }) } : { kind: 'success', text: t('trip.close.closedOk') }} />
        {d.plan.closed_at && <p className="cell-sub">{t('trip.close.closedAt', { at: new Date(d.plan.closed_at).toLocaleString(loc, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) })}</p>}
        {d.plan.close_note && <p>{t('trip.reasonWas', { r: d.plan.close_note })}</p>}
        <div className="row-between total-row"><span>{t('trip.sales')}</span><strong className="num">{formatPaise(sales)}</strong></div>
        <Alert msg={msg} />
        {d.plan.unloaded_at && <button type="button" className="danger" style={{ alignSelf: 'flex-start' }} disabled={revert.busy} data-testid="reopen-trip"
          onClick={() => void revert.run('trip_reopen', d.plan.id, t('trip.revert.reopen'), t('trip.revert.reopenBody', { v: d.plan.vehicle }), t('trip.revert.reopenDone', { v: d.plan.vehicle }), setMsg)}>
          <Undo2 size={18} aria-hidden="true" />{t('trip.revert.reopen')}</button>}
      </div>)
  }
  if (d.plan.status === 'planning') return <div className="card"><Empty icon={<PackageOpen size={26} />} title={t('trip.unload.notLoaded')} /></div>
  if (!d.plan.unloaded_at) return (
    <div className="card stack">
      <Alert msg={{ kind: 'warn', text: t('trip.close.unloadFirst') }} />
      <button type="button" className="primary" style={{ alignSelf: 'flex-start' }} onClick={onUnload}><Undo2 size={18} aria-hidden="true" />{t('trip.truckBack')}</button>
    </div>)

  const close = async () => {
    setBusy(true); setMsg(null)
    try {
      await must(supabase.rpc('trip_close', { p_plan: d.plan.id, p_reason: reason.trim() || null }))
      refreshTrips(qc)
      onDone(left > 0 ? { kind: 'warn', text: t('trip.close.doneShort', { v: d.plan.vehicle, n: left }) } : { kind: 'success', text: t('trip.close.done', { v: d.plan.vehicle }) })
    } catch (e) { setMsg({ kind: 'error', text: errorMessage(t, e) }) } finally { setBusy(false) }
  }
  const pendingOrders = d.orders.filter((o) => o.status === 'locked' || o.status === 'placed').length
  return (
    <div className="stack-lg">
      {left === 0 ? <Alert msg={{ kind: 'success', text: t('trip.close.allMatch') }} /> : (
        <div className="card stack trip-short" data-testid="short-box">
          <strong className="text-danger">{t('trip.close.short', { n: left })}</strong>
          <ul className="plain-list cell-sub">{short.map((i) => <li key={i.variant_id}>{i.label}: {i.left}</li>)}</ul>
          <p className="cell-sub">{t('trip.close.shortHint')}</p>
          <button type="button" style={{ alignSelf: 'flex-start' }} onClick={onBills}><Receipt size={18} aria-hidden="true" />{t('trip.close.enterParchis')}</button>
          <label className="field"><span>{t('trip.close.reason')} *</span>
            <textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('trip.close.reasonPh')} /></label>
        </div>
      )}
      {pendingOrders > 0 && <Alert msg={{ kind: 'warn', text: t('trip.close.ordersOpen', { count: pendingOrders }) }} />}
      <div className="row-between total-row"><span>{t('trip.sales')}</span><strong className="num">{formatPaise(sales)}</strong></div>
      <Alert msg={msg} />
      <button type="button" className={left > 0 ? 'danger-solid' : 'primary'} style={{ alignSelf: 'flex-start' }} disabled={busy || (left > 0 && reason.trim().length < 3)} onClick={() => void close()}>
        <ClipboardCheck size={18} aria-hidden="true" />{busy ? t('common.loading') : left > 0 ? t('trip.close.closeShort', { n: left }) : t('trip.closeTrip')}</button>
    </div>
  )
}
