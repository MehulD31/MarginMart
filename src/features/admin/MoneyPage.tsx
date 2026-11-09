import { useMemo, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, Download, Landmark, Plus, Undo2, Wallet } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise, rupeesToPaise } from '../../shared/money'
import { toCsv } from '../../shared/csv'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'
import { refreshMoney, useMoneyAccounts, useMoneyHoldings, useMoneyPayments, useTransfers, type AccountKind, type Holding, type MoneyPayment, type Transfer } from './money'
import { Pager } from '../../shared/ui/Pager'
import { usePaged } from '../../shared/ui/paging'

const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const monthStart = () => todayIST().slice(0, 8) + '01'
const OVERDUE_DAYS = 7

/** Shop money that landed in a partner's personal account or the cash box, and moving it to the company bank. */
export default function MoneyPage() {
  const { t, i18n } = useTranslation()
  const isAdmin = useAuth().profile?.role === 'admin'
  const qc = useQueryClient()
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'
  const holdings = useMoneyHoldings()
  const accounts = useMoneyAccounts()
  const transfers = useTransfers()
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(todayIST)
  const [filter, setFilter] = useState('')
  const valid = !!from && !!to && from <= to
  const payments = useMoneyPayments(from, to, valid)
  const [moving, setMoving] = useState<Holding | null>(null)
  const [undoing, setUndoing] = useState<Transfer | null>(null)
  const [msg, setMsg] = useState<Msg>(null)
  const [busyRef, setBusyRef] = useState<string | null>(null)

  const list = useMemo(() => (payments.data ?? []).filter((p) => !filter || p.account_id === filter), [payments.data, filter])
  const pg = usePaged(list)
  const when = (iso: string) => new Date(iso).toLocaleString(loc, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

  const change = async (p: MoneyPayment, accountId: string) => {
    setBusyRef(p.ref_id); setMsg(null)
    try {
      await must(supabase.rpc('set_payment_account', { p_kind: p.kind, p_ref: p.ref_id, p_account: accountId }))
      refreshMoney(qc)
      setMsg({ kind: 'success', text: t('money.changed', { what: `${p.number} · ${p.shop}`, account: accounts.data?.find((a) => a.id === accountId)?.name ?? '' }) })
    } catch (e) { setMsg({ kind: 'error', text: errorMessage(t, e) }) } finally { setBusyRef(null) }
  }

  const downloadCsv = () => {
    const rows: (string | number)[][] = [['date', 'time', 'kind', 'bill_or_ref', 'shop', 'mode', 'amount_rs', 'paid_into', 'account_type']]
    for (const p of [...list].reverse()) {
      const d = new Date(p.at)
      rows.push([d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
        p.kind === 'counter_sale' ? 'Counter sale' : 'Khata payment', p.number, p.shop, p.mode, p.amount_paise / 100, p.account ?? '', p.account_kind ?? ''])
    }
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `kd-foods-paid-into-${from}-to-${to}.csv` })
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <section className="stack-lg">
      <PageHeader title={t('money.title')} sub={t('money.sub')} />
      <Alert msg={msg} />

      {/* Who holds company money */}
      {holdings.isLoading ? <Skeleton rows={2} /> : holdings.isError ? <Alert msg={{ kind: 'error', text: errorMessage(t, holdings.error) }} /> : (
        <div className="stats">
          {(holdings.data ?? []).map((h) => {
            const late = h.kind === 'personal' && h.holding_paise > 0 && (h.oldest_days ?? 0) > OVERDUE_DAYS
            return (
              <div key={h.account_id} className="stat stack" data-testid="holding" style={{ gap: 6 }}>
                <div className="label">{h.name}</div>
                <div className="value num">{formatPaise(h.holding_paise)}</div>
                <div className="cell-sub">
                  {h.holding_paise > 0
                    ? <>{t('money.fromPayments', { count: h.payments })} · {h.oldest_days ? t('money.oldest', { days: h.oldest_days }) : t('money.oldestToday')}</>
                    : t('money.allMoved')}
                </div>
                {late && <span className="badge badge-red" style={{ alignSelf: 'flex-start' }}>{t('money.overdue')}</span>}
                {h.holding_paise > 0 && (
                  <button type="button" className="btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setMsg(null); setMoving(h) }}>
                    <Landmark size={16} aria-hidden="true" />{t('money.move')}</button>)}
              </div>)
          })}
        </div>
      )}

      {/* Every payment and where it went */}
      <div className="card stack">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div><h2>{t('money.payments')}</h2><p className="cell-sub">{t('money.paymentsSub')}</p></div>
          <button type="button" className="btn-sm" disabled={!list.length} onClick={downloadCsv}><Download size={16} aria-hidden="true" />{t('money.csv')}</button>
        </div>
        <div className="form-grid" style={{ maxWidth: 640 }}>
          <label className="field"><span>{t('sales.from')}</span><input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>{t('sales.to')}</span><input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="field"><span>{t('money.account')}</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">{t('money.all')}</option>
              {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
        </div>
        {!valid ? <Alert msg={{ kind: 'error', text: t('sales.badRange') }} />
          : payments.isLoading ? <Skeleton rows={3} />
          : payments.isError ? <Alert msg={{ kind: 'error', text: errorMessage(t, payments.error) }} />
          : !list.length ? <Empty icon={<Wallet size={26} />} title={t('money.empty')} />
          : (
            <div className="table-wrap">
              <table className="table-stack">
                <thead><tr><th scope="col">{t('money.what')}</th><th scope="col">{t('money.when')}</th><th scope="col">{t('money.amountCol')}</th><th scope="col">{t('money.paidInto')}</th></tr></thead>
                <tbody>{pg.rows.map((p) => (
                  <tr key={`${p.kind}:${p.ref_id}`} data-testid="money-row">
                    <td className="lead"><div className="cell-title">{p.number} · {p.shop}</div>
                      <div className="cell-sub">{p.kind === 'counter_sale' ? t('nav.sales') : t('nav.khata')} · {p.mode === 'upi' ? 'UPI' : t('driver.cash')}</div></td>
                    <td data-label={t('money.when')}>{when(p.at)}</td>
                    <td data-label={t('money.amountCol')} className="num"><strong>{formatPaise(p.amount_paise)}</strong></td>
                    <td data-label={t('money.paidInto')}>
                      <select aria-label={`${t('money.paidInto')}: ${p.number} ${p.shop}`} value={p.account_id ?? ''} disabled={busyRef === p.ref_id}
                        onChange={(e) => void change(p, e.target.value)}>
                        {(accounts.data ?? []).filter((a) => a.active || a.id === p.account_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </td>
                  </tr>))}</tbody>
              </table>
              <Pager p={pg} />
            </div>
          )}
      </div>

      {/* Moves to the company bank */}
      <div className="card stack">
        <h2>{t('money.transfers')}</h2>
        {transfers.isLoading ? <Skeleton rows={2} /> : !(transfers.data ?? []).length ? <p className="muted">{t('money.noTransfers')}</p> : (
          <ul className="plain-list stack">{(transfers.data ?? []).map((x) => (
            <li key={x.id} className={`row-between ${x.voided_at ? 'dim' : ''}`} data-testid="transfer">
              <span><ArrowRightLeft size={16} aria-hidden="true" /> <strong className="num">{formatPaise(x.amount_paise)}</strong> · {x.account} → {t('money.kind.company')}
                <span className="cell-sub" style={{ display: 'block' }}>{new Date(x.moved_on + 'T00:00:00').toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })}
                  {x.note ? ` · ${x.note}` : ''}{x.voided_at ? ` · ${t('sales.voided')}: ${x.void_reason ?? ''}` : ''}</span></span>
              {isAdmin && !x.voided_at && <button type="button" className="btn-sm ghost" onClick={() => { setMsg(null); setUndoing(x) }}><Undo2 size={16} aria-hidden="true" />{t('money.undo')}</button>}
            </li>))}</ul>
        )}
      </div>

      {isAdmin && <AccountsCard onMsg={setMsg} />}

      <Sheet open={!!moving} title={moving ? t('money.moveTitle', { name: moving.name }) : ''} onClose={() => setMoving(null)}>
        {moving && <MoveForm h={moving} onDone={(text) => { setMoving(null); if (text) setMsg({ kind: 'success', text }) }} />}
      </Sheet>
      <Sheet open={!!undoing} title={t('money.undoTitle')} onClose={() => setUndoing(null)}>
        {undoing && <UndoForm x={undoing} onDone={(text) => { setUndoing(null); if (text) setMsg({ kind: 'success', text }) }} />}
      </Sheet>
    </section>
  )
}

function MoveForm({ h, onDone }: { h: Holding; onDone: (text?: string) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [action] = useState(() => crypto.randomUUID())
  const [amount, setAmount] = useState(String(h.holding_paise / 100))
  const [on, setOn] = useState(todayIST)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const paise = rupeesToPaise(Number(amount) || 0)
  const bad = !(paise > 0) || paise > h.holding_paise || !on || on > todayIST()
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (bad) return
    setBusy(true); setError(null)
    try {
      await must(supabase.rpc('record_money_transfer', { p_action: action, p_account: h.account_id, p_amount_paise: paise, p_on: on, p_note: note.trim() || null }))
      refreshMoney(qc)
      onDone(t('money.moved', { amount: formatPaise(paise) }))
    } catch (err) { setError(errorMessage(t, err)) } finally { setBusy(false) }
  }
  return (
    <form className="stack-lg" onSubmit={submit} noValidate>
      <p className="muted">{t('money.moveBody', { name: h.name, amount: formatPaise(h.holding_paise) })}</p>
      <div className="form-grid">
        <label className="field"><span>{t('money.amount')}</span>
          <input inputMode="decimal" value={amount} aria-invalid={paise > h.holding_paise} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></label>
        <label className="field"><span>{t('money.date')}</span><input type="date" value={on} max={todayIST()} onChange={(e) => setOn(e.target.value)} /></label>
      </div>
      <label className="field"><span>{t('money.note')} <span className="hint">({t('common.optional')})</span></span><input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {paise > h.holding_paise && <p className="cell-sub text-warn">{t('errors.MORE_THAN_HELD')}</p>}
      <Alert msg={error ? { kind: 'error', text: error } : null} />
      <div className="sheet-foot">
        <button type="button" onClick={() => onDone()}>{t('common.cancel')}</button>
        <button type="submit" className="primary" disabled={busy || bad}>{busy ? t('common.loading') : t('money.saveMove')}</button>
      </div>
    </form>
  )
}

function UndoForm({ x, onDone }: { x: Transfer; onDone: (text?: string) => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const date = new Date(x.moved_on + 'T00:00:00').toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await must(supabase.rpc('void_money_transfer', { p_id: x.id, p_reason: reason.trim() })); refreshMoney(qc); onDone(t('money.undone')) }
    catch (err) { setError(errorMessage(t, err)) } finally { setBusy(false) }
  }
  return (
    <form className="stack-lg" onSubmit={submit} noValidate>
      <p className="muted">{t('money.undoBody', { amount: formatPaise(x.amount_paise), date, name: x.account })}</p>
      <label className="field"><span>{t('money.undoReason')} *</span><input maxLength={150} value={reason} autoFocus onChange={(e) => setReason(e.target.value)} /></label>
      <Alert msg={error ? { kind: 'error', text: error } : null} />
      <div className="sheet-foot">
        <button type="button" onClick={() => onDone()}>{t('common.cancel')}</button>
        <button type="submit" className="primary danger" disabled={busy || reason.trim().length < 2}>{busy ? t('common.loading') : t('money.undo')}</button>
      </div>
    </form>
  )
}

function AccountsCard({ onMsg }: { onMsg: (m: Msg) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const accounts = useMoneyAccounts()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('personal')
  const [busy, setBusy] = useState(false)
  const save = async (id: string | null, n: string, k: AccountKind, active: boolean) => {
    setBusy(true); onMsg(null)
    try {
      await must(supabase.rpc('money_account_save', { p_id: id, p_name: n, p_kind: k, p_active: active }))
      void qc.invalidateQueries({ queryKey: ['money-accounts'] }); refreshMoney(qc)
      onMsg({ kind: 'success', text: t('money.saved') }); if (!id) setName('')
    } catch (e) { onMsg({ kind: 'error', text: errorMessage(t, e) }) } finally { setBusy(false) }
  }
  return (
    <div className="card stack">
      <h2>{t('money.accounts')}</h2>
      <ul className="plain-list stack" style={{ gap: 6 }}>{(accounts.data ?? []).map((a) => (
        <li key={a.id} className={`row-between ${a.active ? '' : 'dim'}`}>
          <span><strong>{a.name}</strong> <span className="cell-sub">· {t(`money.kind.${a.kind}`)}</span></span>
          <label className="chip"><input type="checkbox" checked={a.active} disabled={busy} onChange={() => void save(a.id, a.name, a.kind, !a.active)} />{t('money.active')}</label>
        </li>))}</ul>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field grow"><span>{t('money.accountName')}</span><input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mehul (personal)" /></label>
        <label className="field"><span>{t('money.account')}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
            {(['personal', 'company', 'cash'] as const).map((k) => <option key={k} value={k}>{t(`money.kind.${k}`)}</option>)}
          </select></label>
        <button type="button" disabled={busy || name.trim().length < 2} onClick={() => void save(null, name.trim(), kind, true)}><Plus size={16} aria-hidden="true" />{t('money.addAccount')}</button>
      </div>
    </div>
  )
}
