import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookOpen, IndianRupee, Phone, Unlock, Wallet } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must, useRoutes, type Shop } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise, rupeesToPaise } from '../../shared/money'
import { useCreditStatus, useLedger, type LedgerEntry } from '../../shared/ledger'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'
import { BalanceCards, LedgerList } from '../../shared/ui/Khata'

interface Row { shop: Shop; balance: number; overdue: number; lastPay: string | null }

const useKhata = () => useQuery({
  queryKey: ['khata-list'],
  queryFn: async (): Promise<Row[]> => {
    const [shops, bal] = await Promise.all([
      must<Shop[]>(supabase.from('shop').select('*').order('name')),
      must<{ shop_id: string; balance_paise: number; overdue_paise: number; last_payment_at: string | null }[]>(supabase.from('v_shop_balance').select('*')),
    ])
    const b = new Map(bal.map((x) => [x.shop_id, x]))
    return shops.map((s) => ({ shop: s, balance: b.get(s.id)?.balance_paise ?? 0, overdue: b.get(s.id)?.overdue_paise ?? 0, lastPay: b.get(s.id)?.last_payment_at ?? null }))
  },
})

type Filter = 'due' | 'overdue' | 'all'

export default function KhataPage() {
  const { t } = useTranslation()
  const list = useKhata()
  const routes = useRoutes()
  const [filter, setFilter] = useState<Filter>('due')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Shop | null>(null)
  const routeName = new Map(routes.data?.map((r) => [r.id, r.name]))
  const rows = useMemo(() => (list.data ?? [])
    .filter((r) => filter === 'all' || (filter === 'due' ? r.balance > 0 : r.overdue > 0))
    .filter((r) => !q || `${r.shop.name} ${r.shop.phone ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.overdue - a.overdue || b.balance - a.balance), [list.data, filter, q])
  const totals = (list.data ?? []).reduce((a, r) => ({ due: a.due + Math.max(0, r.balance), overdue: a.overdue + r.overdue, adv: a.adv + Math.max(0, -r.balance) }), { due: 0, overdue: 0, adv: 0 })

  return (
    <section className="stack-lg">
      <PageHeader title={t('khata.title')} sub={t('khata.adminSub')} />
      <div className="stats">
        <div className="stat kpi kpi-amber"><span className="kpi-icon" aria-hidden="true"><IndianRupee size={18} /></span><div className="label">{t('khata.totalDue')}</div><div className="value num">{formatPaise(totals.due)}</div></div>
        <div className="stat kpi kpi-amber"><span className="kpi-icon" aria-hidden="true"><Wallet size={18} /></span><div className="label">{t('khata.overdue')}</div><div className="value num">{formatPaise(totals.overdue)}</div></div>
        <div className="stat kpi kpi-green"><span className="kpi-icon" aria-hidden="true"><Wallet size={18} /></span><div className="label">{t('khata.advances')}</div><div className="value num">{formatPaise(totals.adv)}</div></div>
      </div>
      <input type="search" aria-label={t('shops.searchLabel')} placeholder={t('shops.searchLabel')} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 420 }} />
      <div className="segmented" role="tablist" aria-label={t('khata.title')}>
        {(['due', 'overdue', 'all'] as const).map((f) => <button key={f} type="button" role="tab" className="btn-sm" aria-selected={filter === f} onClick={() => setFilter(f)}>{t(`khata.filter.${f}`)}</button>)}
      </div>
      {list.isLoading ? <Skeleton rows={4} /> : rows.length === 0 ? (
        <div className="card"><Empty icon={<BookOpen size={26} />} title={t('khata.nothingDue')} /></div>
      ) : (
        <div className="table-wrap"><table className="table-stack">
          <thead><tr><th scope="col">{t('shops.name')}</th><th scope="col">{t('khata.due')}</th><th scope="col">{t('khata.overdue')}</th><th scope="col"><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.shop.id}>
              <td className="lead"><div className="cell-title">{r.shop.name}</div><div className="cell-sub">{routeName.get(r.shop.route_id)}{r.lastPay ? ` · ${t('khata.lastPaid', { date: new Date(r.lastPay).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) })}` : ''}</div></td>
              <td data-label={t('khata.due')} className="num"><strong>{r.balance < 0 ? `${t('khata.advance')} ${formatPaise(-r.balance)}` : formatPaise(r.balance)}</strong></td>
              <td data-label={t('khata.overdue')} className="num">{r.overdue > 0 ? <span className="badge badge-red">{formatPaise(r.overdue)}</span> : '—'}</td>
              <td className="actions">
                {r.shop.phone && <a className="button btn-sm" href={`tel:+91${r.shop.phone}`} aria-label={`${t('shops.call')} ${r.shop.name}`}><Phone size={16} aria-hidden="true" /></a>}
                <button type="button" className="btn-sm" onClick={() => setOpen(r.shop)}>{t('khata.open')}</button>
              </td>
            </tr>))}
          </tbody>
        </table></div>
      )}
      <Sheet open={!!open} wide title={open?.name} onClose={() => setOpen(null)}>
        {open && <ShopKhata shop={open} />}
      </Sheet>
    </section>
  )
}

function ShopKhata({ shop }: { shop: Shop }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const status = useCreditStatus(shop.id)
  const ledger = useLedger(shop.id)
  const [mode, setMode] = useState<'cash' | 'upi'>('cash')
  const [amount, setAmount] = useState('')
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [voiding, setVoiding] = useState<LedgerEntry | null>(null)
  const [reason, setReason] = useState('')
  const [opening, setOpening] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const refresh = () => ['ledger', 'credit-status', 'khata-list'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }))

  const run = async (fn: () => PromiseLike<{ error: unknown }>, ok: string) => {
    setBusy(true); setMsg(null)
    const { error } = await fn()
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: errorMessage(t, error) }); else { setMsg({ kind: 'success', text: ok }); refresh() }
    return !error
  }
  const paise = rupeesToPaise(Number(amount) || 0)
  const pay = async () => {
    if (await run(() => supabase.rpc('record_payment', { p_action_id: crypto.randomUUID(), p_shop_id: shop.id, p_mode: mode, p_amount_paise: paise, p_upi_ref: ref || null, p_note: note || null }), t('khata.paymentSaved'))) {
      setAmount(''); setRef(''); setNote('')
    }
  }
  const overrideBlock = () => run(() => supabase.rpc('override_credit_block', { p_shop_id: shop.id, p_until: new Date(Date.now() + 2 * 86_400_000).toISOString() }), t('khata.unblocked'))

  return (
    <div className="stack-lg">
      <BalanceCards status={status.data} />
      <Alert msg={msg} />
      {status.data?.blocked && (
        <div className="alert alert-warn" style={{ alignItems: 'center' }}>
          <span className="grow">{t('khata.blockedStaff')}</span>
          <button type="button" className="btn-sm" disabled={busy} onClick={() => void overrideBlock()}><Unlock size={16} aria-hidden="true" />{t('khata.allow2Days')}</button>
        </div>
      )}
      <div className="card stack">
        <h2>{t('khata.recordPayment')}</h2>
        <fieldset className="days"><legend className="sr-only">{t('driver.payMode')}</legend>
          {(['cash', 'upi'] as const).map((m) => <label key={m} className="day-toggle"><input type="radio" name="kmode" checked={mode === m} onChange={() => setMode(m)} /><span>{m === 'cash' ? t('driver.cash') : 'UPI'}</span></label>)}
        </fieldset>
        <div className="form-grid">
          <label className="field"><span>{t('driver.amountReceived')}</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></label>
          {mode === 'upi' ? <label className="field"><span>{t('driver.upiRef')}</span><input maxLength={40} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
            : <label className="field"><span>{t('khata.note')} <span className="hint">({t('common.optional')})</span></span><input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></label>}
        </div>
        <div className="row"><button type="button" className="primary" disabled={busy || paise <= 0} onClick={() => void pay()}>{t('driver.saveCollection', { amount: formatPaise(paise) })}</button></div>
      </div>
      {isAdmin && (
        <details className="card">
          <summary className="cell-title" style={{ cursor: 'pointer' }}>{t('khata.openingTitle')}</summary>
          <div className="stack" style={{ marginTop: 12 }}>
            <p className="muted">{t('khata.openingHint')}</p>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <label className="field grow"><span>{t('khata.openingAmount')}</span><input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^\d.-]/g, ''))} /></label>
              <button type="button" disabled={busy || !Number(opening)} onClick={() => void run(() => supabase.rpc('set_opening_balance', { p_shop_id: shop.id, p_amount_paise: rupeesToPaise(Number(opening)) }), t('khata.openingSaved')).then((ok) => ok && setOpening(''))}>{t('common.save')}</button>
            </div>
          </div>
        </details>
      )}
      <h2>{t('khata.entries')}</h2>
      <LedgerList entries={ledger.data} loading={ledger.isLoading} onVoid={isAdmin ? setVoiding : undefined} />
      <Sheet open={!!voiding} title={t('khata.voidTitle')} onClose={() => setVoiding(null)}>
        {voiding && <div className="stack">
          <p className="muted">{t('khata.voidHint', { amount: formatPaise(Math.abs(voiding.amount_paise)) })}</p>
          <label className="field"><span>{t('khata.voidReason')}</span><input maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <div className="sheet-foot">
            <button type="button" onClick={() => setVoiding(null)}>{t('common.cancel')}</button>
            <button type="button" className="danger-solid" disabled={busy || !reason.trim()} onClick={() => void run(() => supabase.rpc('void_ledger_entry', { p_entry_id: voiding.id, p_reason: reason.trim() }), t('khata.voidDone')).then((ok) => { if (ok) { setVoiding(null); setReason('') } })}>{t('khata.void')}</button>
          </div>
        </div>}
      </Sheet>
    </div>
  )
}
