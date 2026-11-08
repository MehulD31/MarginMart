import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Ban, Pencil, Plus, Receipt } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise } from '../../shared/money'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'
import { CounterSaleForm, type CounterBill } from './CounterSaleForm'
import { DeleteButton } from '../../shared/ui/DeleteButton'
import { useMoneyPayments } from './money'

const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const dayIST = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

/** Counter sales (Telegram /sale, the Google Sheet and this page all write the same bills). */
export default function CounterSalesPage() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const qc = useQueryClient()
  const [from, setFrom] = useState(todayIST)
  const [to, setTo] = useState(todayIST)
  const [editing, setEditing] = useState<CounterBill | 'new' | null>(null)
  const [voiding, setVoiding] = useState<CounterBill | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg>(null)

  const valid = !!from && !!to && from <= to
  const sales = useQuery({
    queryKey: ['counter-sales', from, to],
    enabled: valid,
    queryFn: () => must<CounterBill[] | null>(supabase.rpc('counter_sales', { p_from: from, p_to: to })).then((r) => r ?? []),
    refetchInterval: 30_000,
  })
  // Where each bill's money went (personal accounts get a badge; the form keeps a picked account on edit).
  const money = useMoneyPayments(from, to, valid)
  const paidBy = useMemo(() => new Map((money.data ?? []).filter((p) => p.kind === 'counter_sale').map((p) => [p.ref_id, p])), [money.data])
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'
  const live = useMemo(() => (sales.data ?? []).filter((b) => !b.voided), [sales.data])
  const sum = (bs: CounterBill[], f: (b: CounterBill) => number) => bs.reduce((a, b) => a + f(b), 0)
  const casesOf = (b: CounterBill) => b.lines.reduce((a, l) => a + l.qty, 0)
  const days = useMemo(() => {
    const m = new Map<string, CounterBill[]>()
    for (const b of live) { const d = dayIST(b.at); m.set(d, [...(m.get(d) ?? []), b]) }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [live])

  const doVoid = async (e: FormEvent) => {
    e.preventDefault()
    if (!voiding) return
    setBusy(true); setError(null)
    try {
      await must(supabase.rpc('void_cash_sale', { p_id: voiding.id, p_reason: reason.trim() }))
      for (const k of ['counter-sales', 'counter-catalog', 'stock', 'stock_move', 'month_stats', 'trip-detail', 'trip-board']) void qc.invalidateQueries({ queryKey: [k] })
      setVoiding(null); setReason('')
    } catch (err) { setError(errorMessage(t, err)) } finally { setBusy(false) }
  }

  return (
    <section className="stack-lg">
      <PageHeader title={t('sales.title')} sub={t('sales.sub')}
        actions={<button type="button" className="primary" onClick={() => { setMsg(null); setEditing('new') }}><Plus size={18} aria-hidden="true" />{t('sales.new')}</button>} />
      <Alert msg={msg} />
      <div className="form-grid" style={{ maxWidth: 440 }}>
        <label className="field"><span>{t('sales.from')}</span><input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>{t('sales.to')}</span><input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {!valid && <Alert msg={{ kind: 'error', text: t('sales.badRange') }} />}

      <div className="stats" aria-label={t('sales.summary')}>
        <div className="stat"><div className="label">{t('sales.bills')}</div><div className="value num">{live.length}</div></div>
        <div className="stat"><div className="label">{t('sales.cases')}</div><div className="value num">{sum(live, casesOf)}</div></div>
        <div className="stat"><div className="label">{t('sales.total')}</div><div className="value num">{formatPaise(sum(live, (b) => b.total_paise))}</div></div>
        <div className="stat"><div className="label">{t('driver.cash')}</div><div className="value num">{formatPaise(sum(live, (b) => (b.mode === 'cash' ? b.total_paise : 0)))}</div></div>
        <div className="stat"><div className="label">UPI</div><div className="value num">{formatPaise(sum(live, (b) => (b.mode === 'upi' ? b.total_paise : 0)))}</div></div>
        {isAdmin && <div className="stat"><div className="label">{t('sales.margin')}</div><div className="value num">{formatPaise(sum(live, (b) => b.margin_paise ?? 0))}</div></div>}
      </div>

      {days.length > 1 && (
        <div className="table-wrap">
          <table className="table-stack" aria-label={t('sales.byDay')}>
            <caption className="cell-title" style={{ textAlign: 'left', padding: '0 0 8px' }}>{t('sales.byDay')}</caption>
            <thead><tr><th scope="col">{t('sales.day')}</th><th scope="col">{t('sales.bills')}</th><th scope="col">{t('sales.cases')}</th>
              <th scope="col">{t('sales.total')}</th><th scope="col">{t('driver.cash')}</th><th scope="col">UPI</th>{isAdmin && <th scope="col">{t('sales.margin')}</th>}</tr></thead>
            <tbody>{days.map(([d, bs]) => (
              <tr key={d} data-testid="day-row">
                <td className="lead">{new Date(d + 'T00:00:00').toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                <td data-label={t('sales.bills')} className="num">{bs.length}</td>
                <td data-label={t('sales.cases')} className="num">{sum(bs, casesOf)}</td>
                <td data-label={t('sales.total')} className="num"><strong>{formatPaise(sum(bs, (b) => b.total_paise))}</strong></td>
                <td data-label={t('driver.cash')} className="num">{formatPaise(sum(bs, (b) => (b.mode === 'cash' ? b.total_paise : 0)))}</td>
                <td data-label="UPI" className="num">{formatPaise(sum(bs, (b) => (b.mode === 'upi' ? b.total_paise : 0)))}</td>
                {isAdmin && <td data-label={t('sales.margin')} className="num">{formatPaise(sum(bs, (b) => b.margin_paise ?? 0))}</td>}
              </tr>))}</tbody>
          </table>
        </div>
      )}

      {sales.isLoading ? <Skeleton rows={4} /> : sales.isError ? <Alert msg={{ kind: 'error', text: errorMessage(t, sales.error) }} />
        : !sales.data?.length ? <div className="card"><Empty icon={<Receipt size={26} />} title={t('sales.empty')}><p>{t('sales.emptyHint')}</p></Empty></div>
        : (
          <ul className="plain-list stack">
            {sales.data.map((b) => (
              <li key={b.id} className={`card stack ${b.voided ? 'dim' : ''}`} data-testid="sale-card">
                <div className="row-between">
                  <div>
                    <div className="cell-title">{b.number} · {b.shop}{b.owner ? ` · ${b.owner}` : ''}{b.locality ? ` · ${b.locality}` : ''}</div>
                    <div className="cell-sub">
                      {new Date(b.at).toLocaleString(loc, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                      {b.by ? ` · ${b.by}` : ''}{b.phone ? ` · ${b.phone}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong className="num">{formatPaise(b.total_paise)}</strong>{' '}
                    <span className={`badge ${b.mode === 'upi' ? 'badge-blue' : 'badge-green'}`}>{b.mode === 'upi' ? 'UPI' : t('driver.cash')}</span>
                    {paidBy.get(b.id)?.account_kind === 'personal' && <> <span className="badge badge-amber" data-testid="paid-into">→ {paidBy.get(b.id)!.account}</span></>}
                    {b.vehicle && <> <span className="badge badge-blue" data-testid="truck-badge">🚚 {b.vehicle}</span></>}
                    {b.voided && <> <span className="badge badge-red">{t('sales.voided')}</span></>}
                  </div>
                </div>
                <ul className="plain-list cell-sub">
                  {b.lines.map((l) => <li key={l.variant_id}>{l.item}: {l.qty} × {formatPaise(l.price_paise)} = {formatPaise(l.qty * l.price_paise)}</li>)}
                  {!!b.discount_paise && <li data-testid="sale-discount">{t('sales.form.discount')}: −{formatPaise(b.discount_paise)}</li>}
                </ul>
                {b.voided && <p className="cell-sub">{t('sales.voidReason', { reason: b.void_reason ?? '' })}</p>}
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {!b.voided && <button type="button" className="btn-sm" onClick={() => { setMsg(null); setEditing(b) }}><Pencil size={16} aria-hidden="true" />{t('common.edit')}</button>}
                  {!b.voided && isAdmin && <button type="button" className="btn-sm danger" onClick={() => { setVoiding(b); setReason(''); setError(null) }}>
                    <Ban size={16} aria-hidden="true" />{t('sales.void')}</button>}
                  <DeleteButton kind="counter_sale" id={b.id} name={b.number} invalidate={['counter-sales', 'counter-catalog', 'stock', 'stock_move', 'month_stats', 'trip-detail', 'trip-board']}
                    onDone={(text) => setMsg({ kind: 'success', text })} onError={(text) => setMsg({ kind: 'error', text })} />
                </div>
              </li>))}
          </ul>
        )}

      <Sheet open={!!editing} wide title={editing === 'new' ? t('sales.new') : editing ? t('sales.editTitle', { n: editing.number }) : ''} onClose={() => setEditing(null)}>
        {editing && <CounterSaleForm key={editing === 'new' ? 'new' : editing.id} bill={editing === 'new' ? undefined : editing}
          paidInto={editing === 'new' ? undefined : (paidBy.get(editing.id)?.explicit ? paidBy.get(editing.id)!.account_id ?? undefined : undefined)}
          onDone={(number) => {
            const wasNew = editing === 'new'
            setEditing(null)
            if (number) { setMsg({ kind: 'success', text: wasNew ? t('sales.savedNew', { n: number }) : t('sales.savedEdit', { n: number }) }); if (wasNew) { setFrom(todayIST()); setTo(todayIST()) } }
          }} />}
      </Sheet>

      <Sheet open={!!voiding} title={voiding ? t('sales.voidTitle', { n: voiding.number }) : ''} onClose={() => setVoiding(null)}>
        {voiding && (
          <form className="stack-lg" onSubmit={doVoid} noValidate>
            <p className="muted">{t('sales.voidBody', { shop: voiding.shop, total: formatPaise(voiding.total_paise) })}</p>
            <label className="field"><span>{t('sales.reason')} *</span>
              <input maxLength={150} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></label>
            <Alert msg={error ? { kind: 'error', text: error } : null} />
            <div className="sheet-foot">
              <button type="button" onClick={() => setVoiding(null)}>{t('common.cancel')}</button>
              <button type="submit" className="primary danger" disabled={busy || reason.trim().length < 2}>{busy ? t('common.loading') : t('sales.void')}</button>
            </div>
          </form>
        )}
      </Sheet>
    </section>
  )
}
