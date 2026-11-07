import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Ban, Receipt } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise } from '../../shared/money'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton } from '../../shared/ui/kit'

interface Bill {
  id: string; number: string; at: string; shop: string; locality: string | null; phone: string | null
  mode: 'cash' | 'upi'; total_paise: number; by: string | null; voided: boolean; void_reason: string | null
  margin_paise: number | null; lines: { item: string; qty: number; price_paise: number }[]
}

const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

/** Counter sales entered from Telegram (/sale). Same numbers as the Google Sheet. */
export default function CounterSalesPage() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const qc = useQueryClient()
  const [from, setFrom] = useState(todayIST)
  const [to, setTo] = useState(todayIST)
  const [voiding, setVoiding] = useState<Bill | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = !!from && !!to && from <= to
  const sales = useQuery({
    queryKey: ['counter-sales', from, to],
    enabled: valid,
    queryFn: () => must<Bill[] | null>(supabase.rpc('counter_sales', { p_from: from, p_to: to })).then((r) => r ?? []),
    refetchInterval: 30_000,
  })
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'
  const live = (sales.data ?? []).filter((b) => !b.voided)
  const sum = (f: (b: Bill) => number) => live.reduce((a, b) => a + f(b), 0)
  const cases = sum((b) => b.lines.reduce((a, l) => a + l.qty, 0))
  const total = sum((b) => b.total_paise)
  const cash = sum((b) => (b.mode === 'cash' ? b.total_paise : 0))
  const upi = sum((b) => (b.mode === 'upi' ? b.total_paise : 0))
  const margin = sum((b) => b.margin_paise ?? 0)

  const doVoid = async (e: FormEvent) => {
    e.preventDefault()
    if (!voiding) return
    setBusy(true); setError(null)
    try {
      await must(supabase.rpc('void_cash_sale', { p_id: voiding.id, p_reason: reason.trim() }))
      for (const k of ['counter-sales', 'stock', 'stock_move', 'month_stats']) void qc.invalidateQueries({ queryKey: [k] })
      setVoiding(null); setReason('')
    } catch (err) { setError(errorMessage(t, err)) } finally { setBusy(false) }
  }

  return (
    <section className="stack-lg">
      <PageHeader title={t('sales.title')} sub={t('sales.sub')} />
      <div className="form-grid" style={{ maxWidth: 440 }}>
        <label className="field"><span>{t('sales.from')}</span><input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>{t('sales.to')}</span><input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {!valid && <Alert msg={{ kind: 'error', text: t('sales.badRange') }} />}

      <div className="stats" aria-label={t('sales.summary')}>
        <div className="stat"><div className="label">{t('sales.bills')}</div><div className="value num">{live.length}</div></div>
        <div className="stat"><div className="label">{t('sales.cases')}</div><div className="value num">{cases}</div></div>
        <div className="stat"><div className="label">{t('sales.total')}</div><div className="value num">{formatPaise(total)}</div></div>
        <div className="stat"><div className="label">{t('driver.cash')}</div><div className="value num">{formatPaise(cash)}</div></div>
        <div className="stat"><div className="label">UPI</div><div className="value num">{formatPaise(upi)}</div></div>
        {isAdmin && <div className="stat"><div className="label">{t('sales.margin')}</div><div className="value num">{formatPaise(margin)}</div></div>}
      </div>

      {sales.isLoading ? <Skeleton rows={4} /> : sales.isError ? <Alert msg={{ kind: 'error', text: errorMessage(t, sales.error) }} />
        : !sales.data?.length ? <div className="card"><Empty icon={<Receipt size={26} />} title={t('sales.empty')}><p>{t('sales.emptyHint')}</p></Empty></div>
        : (
          <ul className="plain-list stack">
            {sales.data.map((b) => (
              <li key={b.id} className={`card stack ${b.voided ? 'dim' : ''}`} data-testid="sale-card">
                <div className="row-between">
                  <div>
                    <div className="cell-title">{b.number} · {b.shop}{b.locality ? ` · ${b.locality}` : ''}</div>
                    <div className="cell-sub">
                      {new Date(b.at).toLocaleString(loc, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                      {b.by ? ` · ${b.by}` : ''}{b.phone ? ` · ${b.phone}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong className="num">{formatPaise(b.total_paise)}</strong>{' '}
                    <span className={`badge ${b.mode === 'upi' ? 'badge-blue' : 'badge-green'}`}>{b.mode === 'upi' ? 'UPI' : t('driver.cash')}</span>
                    {b.voided && <> <span className="badge badge-red">{t('sales.voided')}</span></>}
                  </div>
                </div>
                <ul className="plain-list cell-sub">
                  {b.lines.map((l, i) => <li key={i}>{l.item}: {l.qty} × {formatPaise(l.price_paise)} = {formatPaise(l.qty * l.price_paise)}</li>)}
                </ul>
                {b.voided && <p className="cell-sub">{t('sales.voidReason', { reason: b.void_reason ?? '' })}</p>}
                {isAdmin && !b.voided && (
                  <div><button type="button" className="btn-sm danger" onClick={() => { setVoiding(b); setReason(''); setError(null) }}>
                    <Ban size={16} aria-hidden="true" />{t('sales.void')}</button></div>
                )}
              </li>))}
          </ul>
        )}

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
