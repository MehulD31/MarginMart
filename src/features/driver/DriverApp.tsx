import { useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Banknote, CircleCheck, CloudOff, Lock, LogOut, MapPin, MessageCircle, Package, Phone, RefreshCw, Smartphone, Truck, Wallet } from 'lucide-react'
import { useAuth } from '../../shared/api/auth'
import { formatPaise, rupeesToPaise } from '../../shared/money'
import { netRate } from '../../shared/pricing'
import { Alert, Brand, Empty, Sheet, Skeleton } from '../../shared/ui/kit'
import { LanguageToggle } from '../../shared/ui/LanguageToggle'
import { ProductImage } from '../../shared/ui/ProductImage'
import { Stepper } from '../../shared/ui/Stepper'
import { useLocaleDate } from '../admin/opsData'
import { dropAction, enqueue, retryFailed, type QueuedAction } from './offline'
import { useDriverDay, useTruckStock, variantLabel, type DShop, type Snapshot } from './data'
import { EndOfDay } from './EndOfDay'

type Day = ReturnType<typeof useDriverDay>
const REASONS = ['out_of_stock', 'shop_refused', 'damaged', 'shop_closed', 'other'] as const

export default function DriverApp() {
  const { t } = useTranslation()
  const day = useDriverDay()
  return (
    <div className="app-shell">
      <DriverHeader day={day} />
      <main className="app-main driver">
        {day.isLoading ? <Skeleton rows={5} /> : day.isError && !day.snap ? <Alert msg={{ kind: 'error', text: t('driver.firstLoadOffline') }} /> : (
          <Routes>
            <Route index element={<StopList day={day} />} />
            <Route path="stop/:shopId" element={<StopScreen day={day} />} />
            <Route path="close" element={day.snap?.plan ? <EndOfDay day={day} /> : <Navigate to="/driver" replace />} />
            <Route path="*" element={<Navigate to="/driver" replace />} />
          </Routes>
        )}
      </main>
    </div>
  )
}

function DriverHeader({ day }: { day: Day }) {
  const { t } = useTranslation()
  const pending = day.queue.filter((q) => q.status === 'pending').length
  const failed = day.queue.filter((q) => q.status === 'failed').length
  const label = day.offline ? t('driver.offline') : failed ? t('driver.needsFix', { n: failed }) : pending ? t('driver.pending', { n: pending }) : t('driver.synced')
  return (
    <header className="mobile-header always">
      <Brand size={16} />
      <div className="row" style={{ gap: 4 }}>
        <button type="button" className={`sync-chip ${day.offline ? 'off' : failed ? 'bad' : pending ? 'wait' : 'ok'}`} onClick={() => void day.sync()}
          aria-label={`${label}. ${t('driver.syncNow')}`}>
          {day.offline ? <CloudOff size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
          {label}
        </button>
        <LanguageToggle />
      </div>
    </header>
  )
}

interface StopState { shop: DShop; order?: Snapshot['orders'][number]; invoice?: Snapshot['invoices'][number]; queued?: QueuedAction; due: number }

function useStops(snap: Snapshot | undefined, queue: QueuedAction[]): StopState[] {
  return useMemo(() => (snap?.shops ?? []).map((shop) => ({
    shop,
    order: snap!.orders.find((o) => o.shop_id === shop.id),
    invoice: snap!.invoices.find((i) => i.shop_id === shop.id),
    queued: queue.find((q) => q.kind === 'delivery' && q.shopId === shop.id),
    due: snap!.balances[shop.id] ?? 0,
  })), [snap, queue])
}

function StopList({ day }: { day: Day }) {
  const { t } = useTranslation()
  const fmt = useLocaleDate()
  const { signOut } = useAuth()
  const snap = day.snap!
  const stops = useStops(snap, day.queue)
  const stock = useTruckStock(snap, day.queue)
  const [showStock, setShowStock] = useState(false)
  const { i18n } = useTranslation()

  if (!snap.plan) {
    return (
      <div className="stack-lg">
        <div className="card"><Empty icon={<Truck size={26} />} title={t('driver.noPlan')}><p>{t('driver.noPlanHint')}</p></Empty></div>
        <button type="button" className="danger btn-block" onClick={() => void signOut()}><LogOut size={18} aria-hidden="true" />{t('nav.logout')}</button>
      </div>
    )
  }

  const withOrder = stops.filter((s) => s.order)
  const done = stops.filter((s) => s.invoice || s.queued).length
  const doneOrders = withOrder.filter((s) => s.invoice || s.queued).length
  const queuedPay = day.queue.filter((q) => q.status === 'pending').map((q) => q.args.p_payment as { mode: string; amount_paise: number } | undefined ?? (q.kind === 'payment' ? { mode: q.args.p_mode as string, amount_paise: q.args.p_amount_paise as number } : undefined)).filter(Boolean) as { mode: string; amount_paise: number }[]
  const cash = snap.payments.filter((p) => p.payment_mode === 'cash').reduce((a, p) => a - p.amount_paise, 0) + queuedPay.filter((p) => p.mode === 'cash').reduce((a, p) => a + p.amount_paise, 0)
  const upi = snap.payments.filter((p) => p.payment_mode === 'upi').reduce((a, p) => a - p.amount_paise, 0) + queuedPay.filter((p) => p.mode === 'upi').reduce((a, p) => a + p.amount_paise, 0)
  const casesLeft = [...stock.values()].reduce((a, n) => a + Math.max(0, n), 0)
  const sorted = [...stops].sort((a, b) => Number(!!(a.invoice || a.queued)) - Number(!!(b.invoice || b.queued)) || Number(!a.order) - Number(!b.order) || a.shop.stop_seq - b.shop.stop_seq)

  return (
    <div className="stack-lg">
      <section className="hero on-dark" aria-label={t('driver.today')}>
        <div className="grow">
          <p className="hero-kicker">{snap.plan.route.name} · {snap.plan.vehicle?.name}</p>
          <h1>{fmt(snap.plan.date, true)}</h1>
          <p className="hero-sub">{t('driver.progress', { done: doneOrders, total: withOrder.length })}</p>
        </div>
        <div className="ring" style={{ ['--p' as string]: withOrder.length ? Math.round((doneOrders / withOrder.length) * 100) : 0 }} aria-hidden="true">
          <span><b>{doneOrders}</b><small>/ {withOrder.length}</small></span>
        </div>
      </section>
      {day.stale && <Alert msg={{ kind: 'warn', text: t('driver.staleNote', { time: new Date(day.savedAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }) }} />}
      <FailedActions day={day} />

      <div className="stats">
        <div className="stat kpi kpi-green"><span className="kpi-icon" aria-hidden="true"><Banknote size={18} /></span><div className="label">{t('driver.cash')}</div><div className="value num">{formatPaise(cash)}</div></div>
        <div className="stat kpi kpi-blue"><span className="kpi-icon" aria-hidden="true"><Smartphone size={18} /></span><div className="label">UPI</div><div className="value num">{formatPaise(upi)}</div></div>
      </div>
      <button type="button" className="btn-block" onClick={() => setShowStock(true)}><Package size={18} aria-hidden="true" />{t('driver.truckStock', { count: casesLeft })}</button>

      <h2>{t('driver.stops', { n: done, total: stops.length })}</h2>
      <ul className="plain-list stop-list">
        {sorted.map((s) => {
          const cases = s.order?.order_line.reduce((a, l) => a + l.qty_ordered, 0) ?? 0
          const state = s.invoice ? 'done' : s.queued ? (s.queued.status === 'failed' ? 'bad' : 'wait') : s.order ? 'todo' : 'none'
          return (
            <li key={s.shop.id}>
              <Link to={`stop/${s.shop.id}`} className={`stop stop-${state}`}>
                <span className="stop-seq">{s.shop.stop_seq || '·'}</span>
                <span className="grow">
                  <span className="cell-title">{s.shop.name}</span>
                  <span className="cell-sub">{s.order ? t('driver.orderLine', { n: cases }) : t('driver.noOrder')}{s.due > 0 ? ` · ${t('driver.dueAmt', { amount: formatPaise(s.due) })}` : ''}</span>
                </span>
                <span className={`badge ${state === 'done' ? 'badge-green' : state === 'wait' ? 'badge-amber' : state === 'bad' ? 'badge-red' : state === 'todo' ? 'badge-blue' : ''}`}>{t(`driver.state.${state}`)}</span>
              </Link>
            </li>)
        })}
      </ul>

      <Link to="close" className="button btn-block"><Lock size={18} aria-hidden="true" />{t('eod.title')}</Link>

      <Sheet open={showStock} title={t('driver.truckStockTitle')} onClose={() => setShowStock(false)}>
        <ul className="plain-list top-list">
          {snap.catalog.filter((c) => stock.has(c.variant.id)).sort((a, b) => (stock.get(b.variant.id) ?? 0) - (stock.get(a.variant.id) ?? 0)).map((c) => (
            <li key={c.variant.id}><ProductImage path={c.variant.image_path} name={`${c.variant.flavour_en} ${c.pack.name_en}`} size={40} />
              <span className="grow cell-title">{variantLabel(c, i18n.language === 'hi')}</span><strong className="num">{stock.get(c.variant.id)}</strong></li>))}
        </ul>
      </Sheet>
    </div>
  )
}

function FailedActions({ day }: { day: Day }) {
  const { t } = useTranslation()
  const failed = day.queue.filter((q) => q.status === 'failed')
  if (!failed.length) return null
  return (
    <div className="alert alert-error stack" role="alert" style={{ flexDirection: 'column' }}>
      <strong>{t('driver.failedTitle')}</strong>
      {failed.map((f) => (
        <div key={f.id} className="row-between" style={{ width: '100%' }}>
          <span>{day.snap?.shops.find((s) => s.id === f.shopId)?.name}: {t(`errors.${f.error}`, { defaultValue: f.error })}</span>
          <span className="row"><button type="button" className="btn-sm" onClick={() => void retryFailed(f.id).then(() => day.sync())}>{t('driver.retry')}</button>
            <button type="button" className="btn-sm danger" onClick={() => void dropAction(f.id)}>{t('driver.discard')}</button></span>
        </div>))}
    </div>
  )
}

function StopScreen({ day }: { day: Day }) {
  const { t, i18n } = useTranslation()
  const hi = i18n.language === 'hi'
  const navigate = useNavigate()
  const { shopId } = useParams()
  const snap = day.snap!
  const stop = useStops(snap, day.queue).find((s) => s.shop.id === shopId)
  const stock = useTruckStock(snap, day.queue)
  const cat = useMemo(() => new Map(snap.catalog.map((c) => [c.variant.id, c])), [snap.catalog])
  const ordered = useMemo(() => new Map(stop?.order?.order_line.map((l) => [l.variant_id, l]) ?? []), [stop])
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries([...ordered].map(([id, l]) => [id, l.qty_ordered])))
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState('')
  const [mode, setMode] = useState<'cash' | 'upi'>('cash')
  const [amount, setAmount] = useState<string | null>(null)
  const [upiRef, setUpiRef] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  const [collect, setCollect] = useState(false)

  if (!stop || !snap.plan) return <Navigate to="/driver" replace />
  const doneAlready = !!(stop.invoice || stop.queued)
  const priceOf = (id: string) => ordered.get(id)?.unit_price_paise ?? (cat.get(id)?.price ? netRate(cat.get(id)!.price!) : 0)
  const ids = [...new Set([...ordered.keys(), ...Object.keys(qty)])]
  const total = ids.reduce((a, id) => a + (qty[id] ?? 0) * priceOf(id), 0)
  // Spare still free on the truck = stock left − cases reserved for stops not yet delivered (this one included).
  const reserved = new Map<string, number>()
  for (const o of snap.orders) {
    if (snap.invoices.some((i) => i.shop_id === o.shop_id) || day.queue.some((a) => a.kind === 'delivery' && a.shopId === o.shop_id)) continue
    for (const l of o.order_line) reserved.set(l.variant_id, (reserved.get(l.variant_id) ?? 0) + l.qty_ordered)
  }
  const avail = (id: string) => Math.max(0, (stock.get(id) ?? 0) - (reserved.get(id) ?? 0))
  const short = ids.filter((id) => (qty[id] ?? 0) < (ordered.get(id)?.qty_ordered ?? 0))
  const missingReason = short.some((id) => !reasons[id])
  const extraOver = ids.some((id) => (qty[id] ?? 0) - (ordered.get(id)?.qty_ordered ?? 0) > avail(id))
  const pay = amount === null ? total : rupeesToPaise(Number(amount) || 0)
  const after = stop.due + total - pay

  const submit = async () => {
    const id = crypto.randomUUID()
    const p_payment = pay > 0 ? { mode, amount_paise: pay, upi_ref: mode === 'upi' ? upiRef.trim() : undefined } : null
    await enqueue({ id, kind: 'delivery', shopId: stop.shop.id, args: {
      p_plan_id: snap.plan!.id, p_shop_id: stop.shop.id, p_payment,
      p_lines: ids.map((v) => ({ variant_id: v, qty: qty[v] ?? 0, reason: reasons[v] ?? null })),
    } })
    setReceipt(id)
    void day.sync()
  }

  const lines = ids.filter((id) => cat.has(id))
  const extraChoices = snap.catalog.filter((c) => avail(c.variant.id) > 0 && !(c.variant.id in qty) && c.price)

  return (
    <div className="stack-lg">
      <div className="row-between">
        <button type="button" className="ghost" style={{ paddingLeft: 0 }} onClick={() => navigate('/driver')}><ArrowLeft size={18} aria-hidden="true" />{t('driver.allStops')}</button>
        {stop.shop.phone && <a className="button btn-sm" href={`tel:+91${stop.shop.phone}`}><Phone size={16} aria-hidden="true" />{t('shops.call')}</a>}
      </div>
      <div>
        <h1>{stop.shop.name}</h1>
        {stop.shop.address && <p className="muted row" style={{ marginTop: 4 }}><MapPin size={14} aria-hidden="true" />{stop.shop.address}</p>}
      </div>
      <div className="stats">
        <div className="stat"><div className="label">{t('driver.oldDue')}</div><div className={`value num ${stop.due > 0 ? 'text-warn' : ''}`}>{formatPaise(Math.max(0, stop.due))}</div>{stop.due < 0 && <div className="cell-sub">{t('driver.advance', { amount: formatPaise(-stop.due) })}</div>}</div>
        <div className="stat"><div className="label">{t('driver.thisBill')}</div><div className="value num">{formatPaise(doneAlready ? stop.invoice?.total_paise ?? 0 : total)}</div></div>
      </div>

      {doneAlready ? (
        <>
          <Alert msg={{ kind: stop.queued?.status === 'failed' ? 'error' : 'success', text: stop.invoice ? t('driver.deliveredNote', { no: stop.invoice.number }) : t('driver.queuedNote') }} />
          <div className="row">
            <button type="button" className="grow" onClick={() => setReceipt(stop.queued?.id ?? `inv:${stop.invoice!.id}`)}><MessageCircle size={18} aria-hidden="true" />{t('driver.showBill')}</button>
            <button type="button" className="primary grow" onClick={() => setCollect(true)}><Wallet size={18} aria-hidden="true" />{t('driver.collect')}</button>
          </div>
        </>
      ) : (
        <>
          <div className="card card-flush">
            {lines.length === 0 && <p className="muted" style={{ padding: 16 }}>{t('driver.vanOnly')}</p>}
            <ul className="plain-list">
              {lines.map((id) => {
                const c = cat.get(id)!; const o = ordered.get(id)?.qty_ordered ?? 0; const q = qty[id] ?? 0
                return (
                  <li key={id} className="deliver-line">
                    <div className="row" style={{ gap: 12 }}>
                      <ProductImage path={c.variant.image_path} name={`${c.variant.flavour_en} ${c.pack.name_en}`} size={48} />
                      <div className="grow"><div className="cell-title">{variantLabel(c, hi)}</div>
                        <div className="cell-sub num">{o ? t('driver.ordered', { n: o }) : t('driver.extra')} · {formatPaise(priceOf(id))}</div></div>
                      <Stepper value={q} onChange={(n) => setQty((x) => ({ ...x, [id]: Math.max(0, Math.min(n, o + avail(id))) }))} label={variantLabel(c, hi)} />
                    </div>
                    {q < o && (
                      <label className="field"><span>{t('driver.whyLess', { n: o - q })}</span>
                        <select value={reasons[id] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [id]: e.target.value }))} aria-invalid={!reasons[id]}>
                          <option value="">{t('orders.chooseReason')}</option>
                          {REASONS.map((r) => <option key={r} value={r}>{t(`driver.reason.${r}`)}</option>)}
                        </select></label>
                    )}
                  </li>)
              })}
            </ul>
          </div>
          {extraChoices.length > 0 && (
            <label className="field"><span>{t('driver.addFromTruck')}</span>
              <select value={adding} onChange={(e) => { if (e.target.value) setQty((x) => ({ ...x, [e.target.value]: 1 })); setAdding('') }}>
                <option value="">{t('loading.choose')}</option>
                {extraChoices.map((c) => <option key={c.variant.id} value={c.variant.id}>{variantLabel(c, hi)} ({t('driver.onTruck', { n: avail(c.variant.id) })})</option>)}
              </select></label>
          )}

          <div className="card stack">
            <h2>{t('driver.payment')}</h2>
            <fieldset className="days"><legend className="sr-only">{t('driver.payMode')}</legend>
              {(['cash', 'upi'] as const).map((m) => (
                <label key={m} className="day-toggle"><input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} /><span>{m === 'cash' ? t('driver.cash') : 'UPI'}</span></label>))}
            </fieldset>
            <label className="field"><span>{t('driver.amountReceived')}</span>
              <input inputMode="decimal" value={amount ?? String(total / 100)} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} onFocus={(e) => e.target.select()} /></label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="btn-sm" onClick={() => setAmount(String(total / 100))}>{t('driver.payBill')}</button>
              {stop.due > 0 && <button type="button" className="btn-sm" onClick={() => setAmount(String((total + stop.due) / 100))}>{t('driver.payAll', { amount: formatPaise(total + stop.due) })}</button>}
              <button type="button" className="btn-sm" onClick={() => setAmount('0')}>{t('driver.payLater')}</button>
            </div>
            {mode === 'upi' && pay > 0 && <label className="field"><span>{t('driver.upiRef')} <span className="hint">({t('common.optional')})</span></span>
              <input maxLength={40} value={upiRef} onChange={(e) => setUpiRef(e.target.value)} /></label>}
            <div className="row-between total-row"><span>{t('driver.balanceAfter')}</span><strong className={`num ${after > 0 ? 'text-warn' : ''}`}>{after < 0 ? t('driver.advance', { amount: formatPaise(-after) }) : formatPaise(after)}</strong></div>
          </div>
          {missingReason && <Alert msg={{ kind: 'warn', text: t('driver.needReason') }} />}
          <button type="button" className="primary btn-block big" disabled={missingReason || extraOver} onClick={() => void submit()}>
            <CircleCheck size={20} aria-hidden="true" />{total === 0 ? t('driver.markNothing') : t('driver.complete', { amount: formatPaise(total) })}</button>
        </>
      )}

      <Sheet open={!!receipt} title={t('driver.billTitle')} onClose={() => { setReceipt(null); if (!doneAlready) navigate('/driver') }}>
        {receipt && <Receipt day={day} stop={stop} actionId={receipt} onDone={() => { setReceipt(null); navigate('/driver') }} />}
      </Sheet>
      <Sheet open={collect} title={t('driver.collectTitle', { shop: stop.shop.name })} onClose={() => setCollect(false)}>
        {collect && <CollectDue stop={stop} onDone={() => { setCollect(false); void day.sync() }} />}
      </Sheet>
    </div>
  )
}

/** Bill summary built from what was delivered. Shared to the shop on WhatsApp as plain text (no paid API). */
function Receipt({ day, stop, actionId, onDone }: { day: Day; stop: StopState; actionId: string; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const hi = i18n.language === 'hi'
  const snap = day.snap!
  const cat = new Map(snap.catalog.map((c) => [c.variant.id, c]))
  const q = day.queue.find((x) => x.id === actionId)
  const inv = actionId.startsWith('inv:') ? snap.invoices.find((i) => `inv:${i.id}` === actionId) : stop.invoice
  const lines = inv ? inv.delivery_line.filter((d) => d.qty_delivered > 0).map((d) => ({ id: d.variant_id, qty: d.qty_delivered, price: d.unit_price_paise }))
    : ((q?.args.p_lines as { variant_id: string; qty: number }[]) ?? []).filter((l) => l.qty > 0).map((l) => ({
        id: l.variant_id, qty: l.qty,
        price: stop.order?.order_line.find((o) => o.variant_id === l.variant_id)?.unit_price_paise ?? (cat.get(l.variant_id)?.price ? netRate(cat.get(l.variant_id)!.price!) : 0),
      }))
  const total = inv?.total_paise ?? lines.reduce((a, l) => a + l.qty * l.price, 0)
  const paid = (q?.args.p_payment as { amount_paise: number } | null)?.amount_paise ?? 0
  const number = inv?.number ?? t('driver.provisional')
  const text = [
    `*${t('driver.billFor', { shop: stop.shop.name })}*`, `${t('driver.billNo')}: ${number}`, new Date().toLocaleDateString('en-IN'), '',
    ...lines.map((l) => `${variantLabel(cat.get(l.id)!, hi)} × ${l.qty} = ${formatPaise(l.qty * l.price)}`), '',
    `${t('shop.total')}: ${formatPaise(total)}`, paid ? `${t('driver.paid')}: ${formatPaise(paid)}` : '', `— MarginMart`,
  ].filter((x) => x !== '').join('\n')
  const wa = stop.shop.phone ? `https://wa.me/91${stop.shop.phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`

  return (
    <div className="stack">
      <div className="pin-reveal"><span className="muted">{number}</span><span className="digits" style={{ letterSpacing: 0 }}>{formatPaise(total)}</span>
        {!inv && <span className="badge badge-amber">{t('driver.willSync')}</span>}</div>
      <ul className="plain-list">{lines.map((l) => (
        <li key={l.id} className="row-between pin-row"><span>{variantLabel(cat.get(l.id)!, hi)} × {l.qty}</span><span className="num">{formatPaise(l.qty * l.price)}</span></li>))}</ul>
      {paid > 0 && <div className="row-between"><span>{t('driver.paid')}</span><strong className="num">{formatPaise(paid)}</strong></div>}
      <div className="sheet-foot">
        <a className="button whatsapp" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" />{t('users.shareWhatsApp')}</a>
        <button type="button" className="primary" onClick={onDone}>{t('driver.nextStop')}</button>
      </div>
    </div>
  )
}

function CollectDue({ stop, onDone }: { stop: StopState; onDone: () => void }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'cash' | 'upi'>('cash')
  const [amount, setAmount] = useState(String(Math.max(0, stop.due) / 100))
  const [ref, setRef] = useState('')
  const paise = rupeesToPaise(Number(amount) || 0)
  const save = async () => {
    await enqueue({ id: crypto.randomUUID(), kind: 'payment', shopId: stop.shop.id, args: { p_shop_id: stop.shop.id, p_mode: mode, p_amount_paise: paise, p_upi_ref: ref || null, p_note: 'collected on route' } })
    onDone()
  }
  return (
    <div className="stack">
      <p className="muted">{t('driver.dueNow', { amount: formatPaise(Math.max(0, stop.due)) })}</p>
      <fieldset className="days"><legend className="sr-only">{t('driver.payMode')}</legend>
        {(['cash', 'upi'] as const).map((m) => <label key={m} className="day-toggle"><input type="radio" name="cmode" checked={mode === m} onChange={() => setMode(m)} /><span>{m === 'cash' ? t('driver.cash') : 'UPI'}</span></label>)}
      </fieldset>
      <label className="field"><span>{t('driver.amountReceived')}</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></label>
      {mode === 'upi' && <label className="field"><span>{t('driver.upiRef')}</span><input maxLength={40} value={ref} onChange={(e) => setRef(e.target.value)} /></label>}
      <div className="sheet-foot"><button type="button" className="primary" disabled={paise <= 0} onClick={() => void save()}>{t('driver.saveCollection', { amount: formatPaise(paise) })}</button></div>
    </div>
  )
}
