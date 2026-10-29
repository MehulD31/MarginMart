import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CircleCheck, Lock } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { formatPaise, rupeesToPaise } from '../../shared/money'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, type Msg } from '../../shared/ui/kit'
import { ProductImage } from '../../shared/ui/ProductImage'
import { Stepper } from '../../shared/ui/Stepper'
import { useConfirm } from '../../shared/ui/confirm'
import { useDriverDay, useTruckStock, variantLabel } from './data'

type Day = ReturnType<typeof useDriverDay>
interface Result { expected_cash_paise: number; handed_cash_paise: number; cash_diff_paise: number; stock_diff: { variant_id: string; expected: number; returned: number }[] }

/** Driver counts the truck and the cash at the warehouse. Needs everything synced first. */
export function EndOfDay({ day }: { day: Day }) {
  const { t, i18n } = useTranslation()
  const hi = i18n.language === 'hi'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const snap = day.snap!
  const stock = useTruckStock(snap, day.queue)
  const cat = useMemo(() => new Map(snap.catalog.map((c) => [c.variant.id, c])), [snap.catalog])
  const loaded = snap.load.map((l) => l.variant_id)
  const [counted, setCounted] = useState<Record<string, number>>(() => Object.fromEntries(loaded.map((id) => [id, Math.max(0, stock.get(id) ?? 0)])))
  const expectedCash = snap.payments.filter((p) => p.payment_mode === 'cash').reduce((a, p) => a - p.amount_paise, 0)
  const [cash, setCash] = useState(String(expectedCash / 100))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [result, setResult] = useState<Result | null>(null)

  const waiting = day.queue.length > 0
  const handed = rupeesToPaise(Number(cash) || 0)
  const stockDiff = loaded.filter((id) => (counted[id] ?? 0) !== Math.max(0, stock.get(id) ?? 0))

  const submit = async () => {
    const warn = stockDiff.length || handed !== expectedCash
    if (warn && !(await confirm({ title: t('eod.confirmTitle'), body: t('eod.confirmDiff'), confirm: t('eod.closeAnyway'), danger: true }))) return
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('close_day', {
      p_action_id: crypto.randomUUID(), p_plan_id: snap.plan!.id, p_cash_handed_paise: handed, p_note: note.trim() || null,
      p_returned: loaded.map((variant_id) => ({ variant_id, qty: counted[variant_id] ?? 0 })),
    })
    setBusy(false)
    if (error) { setMsg({ kind: 'error', text: /fetch|network/i.test(error.message) ? t('eod.needOnline') : errorMessage(t, error) }); return }
    setResult(data as Result)
  }

  if (result) {
    const ok = result.cash_diff_paise === 0 && result.stock_diff.length === 0
    return (
      <div className="stack-lg">
        <div className="pin-reveal">
          <CircleCheck size={36} aria-hidden="true" style={{ color: 'var(--brand-700)' }} />
          <h1>{t('eod.closed')}</h1>
          <span className="muted">{ok ? t('eod.allMatch') : t('eod.flagged')}</span>
        </div>
        {result.cash_diff_paise !== 0 && <Alert msg={{ kind: 'warn', text: t(result.cash_diff_paise < 0 ? 'eod.cashShort' : 'eod.cashOver', { amount: formatPaise(Math.abs(result.cash_diff_paise)) }) }} />}
        {result.stock_diff.map((d) => <Alert key={d.variant_id} msg={{ kind: 'warn', text: t('eod.stockLine', { item: cat.get(d.variant_id) ? variantLabel(cat.get(d.variant_id)!, hi) : '?', expected: d.expected, returned: d.returned }) }} />)}
        <button type="button" className="primary btn-block big" onClick={() => { void qc.invalidateQueries({ queryKey: ['driver-day'] }); navigate('/driver') }}>{t('eod.done')}</button>
      </div>
    )
  }

  return (
    <div className="stack-lg">
      <button type="button" className="ghost" style={{ paddingLeft: 0, alignSelf: 'flex-start' }} onClick={() => navigate('/driver')}><ArrowLeft size={18} aria-hidden="true" />{t('driver.allStops')}</button>
      <div><h1>{t('eod.title')}</h1><p className="muted" style={{ marginTop: 4 }}>{t('eod.sub')}</p></div>
      {waiting && <Alert msg={{ kind: 'error', text: t('eod.syncFirst', { n: day.queue.length }) }} />}
      <Alert msg={msg} />

      <div className="card card-flush">
        <h2 style={{ padding: '14px 14px 0' }}>{t('eod.countTruck')}</h2>
        <ul className="plain-list">{loaded.map((id) => {
          const c = cat.get(id); if (!c) return null
          const exp = Math.max(0, stock.get(id) ?? 0)
          return (
            <li key={id} className="deliver-line">
              <div className="row" style={{ gap: 12 }}>
                <ProductImage path={c.variant.image_path} name={`${c.variant.flavour_en} ${c.pack.name_en}`} size={44} />
                <div className="grow"><div className="cell-title">{variantLabel(c, hi)}</div>
                  <div className={`cell-sub ${(counted[id] ?? 0) !== exp ? 'text-warn' : ''}`}>{t('eod.shouldBe', { n: exp })}</div></div>
                <Stepper value={counted[id] ?? 0} onChange={(n) => setCounted((x) => ({ ...x, [id]: Math.max(0, n) }))} label={variantLabel(c, hi)} />
              </div>
            </li>)
        })}</ul>
      </div>

      <div className="card stack">
        <h2>{t('eod.cashTitle')}</h2>
        <p className="muted">{t('eod.cashExpected', { amount: formatPaise(expectedCash) })}</p>
        <label className="field"><span>{t('eod.cashInHand')}</span>
          <input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ''))} aria-invalid={handed !== expectedCash} /></label>
        {handed !== expectedCash && <p className="text-warn">{t(handed < expectedCash ? 'eod.cashShort' : 'eod.cashOver', { amount: formatPaise(Math.abs(handed - expectedCash)) })}</p>}
        <label className="field"><span>{t('khata.note')} <span className="hint">({t('common.optional')})</span></span>
          <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>

      <button type="button" className="primary btn-block big" disabled={busy || waiting} onClick={() => void submit()}>
        <Lock size={20} aria-hidden="true" />{busy ? t('common.loading') : t('eod.close')}</button>
    </div>
  )
}
