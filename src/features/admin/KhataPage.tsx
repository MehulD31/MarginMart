import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookOpen, IndianRupee, Phone, Wallet } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must, useRoutes, type Shop } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise, rupeesToPaise } from '../../shared/money'
import { useCreditStatus, useLedger, type LedgerEntry } from '../../shared/ledger'
import { errorMessage } from '../../shared/ui/errors'
import { useDraft, useRemembered } from '../../shared/ui/draft'
import { DraftNote } from '../../shared/ui/DraftNote'
import { Alert, Empty, PageHeader, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'
import { BalanceCards, LedgerList } from '../../shared/ui/Khata'
import { Pager } from '../../shared/ui/Pager'
import { usePaged } from '../../shared/ui/paging'
import { MONEY_KEYS, useMoneyPayments } from './money'
import { PaidIntoSelect } from './PaidIntoSelect'

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

type Filter = 'due' | 'overdue' | 'all' | 'received'
interface OpenItem { shop_id: string; shop: string; at: string; kind: string; label: string; charge_paise: number; remaining_paise: number; paid_paise: number; days: number; cash_sale_id: string | null }
const useOpenItems = (shop?: string) => useQuery({
  queryKey: ['khata-open', shop ?? 'all'],
  queryFn: () => must<OpenItem[]>(supabase.rpc('khata_open_items', { p_shop: shop ?? null })),
})
const istDay = (shift = 0) => { const d = new Date(Date.now() + shift * 86400000); return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }

interface PayDraft { action: string; mode: 'cash' | 'upi'; account: string; amount: string; ref: string; note: string }
export default function KhataPage() {
  const { t } = useTranslation()
  const list = useKhata()
  const routes = useRoutes()
  const [filter, setFilter] = useRemembered<Filter>('view:khata:filter', 'due')
  const [q, setQ] = useRemembered('view:khata:q', '')
  const [open, setOpen] = useState<Shop | null>(null)
  const [span, setSpan] = useRemembered<'0' | '7' | '30'>('view:khata:span', '0')
  const routeName = new Map(routes.data?.map((r) => [r.id, r.name]))
  const rows = useMemo(() => (list.data ?? [])
    .filter((r) => filter === 'all' || (filter === 'due' ? r.balance > 0 : r.overdue > 0))
    .filter((r) => !q || `${r.shop.name} ${r.shop.phone ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.overdue - a.overdue || b.balance - a.balance), [list.data, filter, q])
  const totals = (list.data ?? []).reduce((a, r) => ({ due: a.due + Math.max(0, r.balance), overdue: a.overdue + r.overdue, adv: a.adv + Math.max(0, -r.balance) }), { due: 0, overdue: 0, adv: 0 })

  const pg = usePaged(rows)
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
        {(['due', 'overdue', 'all', 'received'] as const).map((f) => <button key={f} type="button" role="tab" className="btn-sm" aria-selected={filter === f} onClick={() => setFilter(f)}>{t(`khata.filter.${f}`)}</button>)}
      </div>
      {filter === 'received' ? <Received span={Number(span)} setSpan={(n) => setSpan(String(n) as '0' | '7' | '30')} q={q} /> : list.isLoading ? <Skeleton rows={4} /> : rows.length === 0 ? (
        <div className="card"><Empty icon={<BookOpen size={26} />} title={t('khata.nothingDue')} /></div>
      ) : (
        <div className="table-wrap"><table className="table-stack">
          <thead><tr><th scope="col">{t('shops.name')}</th><th scope="col">{t('khata.due')}</th><th scope="col">{t('khata.overdue')}</th><th scope="col"><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
          <tbody>{pg.rows.map((r) => (
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
        </table><Pager p={pg} /></div>
      )}
      <Sheet open={!!open} wide title={open?.name} onClose={() => setOpen(null)}>
        {open && <ShopKhata shop={open} />}
      </Sheet>
    </section>
  )
}

/** Every payment that came in (at the bill or later on the Khata), newest first. */
function Received({ span, setSpan, q }: { span: number; setSpan: (n: number) => void; q: string }) {
  const { t } = useTranslation()
  const pay = useMoneyPayments(istDay(-span), istDay(0))
  const rows = (pay.data ?? []).filter((p) => !q || p.shop.toLowerCase().includes(q.toLowerCase()))
  const sum = rows.reduce((a, p) => a + p.amount_paise, 0)
  const pg = usePaged(rows)
  return (
    <div className="stack">
      <div className="segmented" role="tablist" aria-label={t('khata.received.period')}>
        {[0, 7, 30].map((n) => <button key={n} type="button" role="tab" className="btn-sm" aria-selected={span === n} onClick={() => setSpan(n)}>{t(`khata.received.span${n}`)}</button>)}
      </div>
      <div className="stat kpi kpi-green"><span className="kpi-icon" aria-hidden="true"><Wallet size={18} /></span><div className="label">{t('khata.received.total')}</div><div className="value num" data-testid="received-total">{formatPaise(sum)}</div></div>
      {pay.isLoading ? <Skeleton rows={4} /> : rows.length === 0 ? <div className="card"><Empty icon={<BookOpen size={26} />} title={t('khata.received.none')} /></div> : (
        <div className="table-wrap"><table className="table-stack">
          <thead><tr><th scope="col">{t('shops.name')}</th><th scope="col">{t('khata.received.for')}</th><th scope="col">{t('khata.received.when')}</th><th scope="col">{t('khata.received.amount')}</th></tr></thead>
          <tbody>{pg.rows.map((p) => (
            <tr key={p.kind + p.ref_id}>
              <td className="lead"><div className="cell-title">{p.shop}</div></td>
              <td data-label={t('khata.received.for')}>{p.kind === 'counter_sale' ? t('khata.received.atBill', { n: p.number }) : t('khata.received.later')}<div className="cell-sub">{p.mode === 'upi' ? 'UPI' : t('driver.cash')}{p.account ? ` · ${p.account}` : ''}</div></td>
              <td data-label={t('khata.received.when')}>{new Date(p.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
              <td data-label={t('khata.received.amount')} className="num"><strong>{formatPaise(p.amount_paise)}</strong></td>
            </tr>))}</tbody>
        </table><Pager p={pg} /></div>)}
    </div>
  )
}

function OpenBills({ shopId }: { shopId: string }) {
  const { t } = useTranslation()
  const items = useOpenItems(shopId)
  if (!items.data?.length) return null
  return (
    <div className="card stack" data-testid="open-bills">
      <h2>{t('khata.openBills.title')}</h2>
      <p className="muted">{t('khata.openBills.hint')}</p>
      <ul className="plain-list">{items.data.map((i) => (
        <li key={(i.cash_sale_id ?? i.label) + i.at} className="row-between" style={{ gap: 8, alignItems: 'flex-start' }}>
          <div><div className="cell-title">{i.label}</div>
            <div className="cell-sub">{new Date(i.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {t('khata.openBills.days', { n: i.days })}{i.paid_paise > 0 ? ` · ${t('khata.openBills.paidOf', { p: formatPaise(i.paid_paise), t: formatPaise(i.charge_paise) })}` : ` · ${formatPaise(i.charge_paise)}`}</div></div>
          <span className={`badge ${i.days > 7 ? 'badge-red' : 'badge-amber'}`}>{t('khata.openBills.left', { a: formatPaise(i.remaining_paise) })}</span>
        </li>))}</ul>
    </div>
  )
}

function ShopKhata({ shop }: { shop: Shop }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const status = useCreditStatus(shop.id)
  const ledger = useLedger(shop.id)
  // The payment being typed for this shop is kept until it is saved. Its action id is kept too, so if a save was cut off and you
  // tap Save again after reopening, the server still counts that payment only once.
  const freshPay = (): PayDraft => ({ action: crypto.randomUUID(), mode: 'cash', account: '', amount: '', ref: '', note: '' })
  const draft = useDraft<PayDraft>(`khata-pay:${shop.id}`, freshPay)
  const { mode, account, amount, ref, note } = draft.value
  const upd = <K extends keyof PayDraft>(k: K) => (v: PayDraft[K]) => draft.set((p) => ({ ...p, [k]: v }))
  const setMode = upd('mode'), setAccount = upd('account'), setAmount = upd('amount'), setRef = upd('ref'), setNote = upd('note')
  const [voiding, setVoiding] = useState<LedgerEntry | null>(null)
  const [reason, setReason] = useState('')
  const [opening, setOpening] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const refresh = () => ['ledger', 'credit-status', 'khata-list', 'khata-open', ...MONEY_KEYS].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }))

  const run = async (fn: () => PromiseLike<{ error: unknown }>, ok: string) => {
    setBusy(true); setMsg(null)
    const { error } = await fn()
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: errorMessage(t, error) }); else { setMsg({ kind: 'success', text: ok }); refresh() }
    return !error
  }
  const paise = rupeesToPaise(Number(amount) || 0)
  const pay = async () => {
    if (await run(() => supabase.rpc('record_payment_into', { p_action_id: draft.value.action, p_shop_id: shop.id, p_mode: mode, p_amount_paise: paise, p_upi_ref: ref || null, p_note: note || null, p_account: account || null }), t('khata.paymentSaved'))) {
      draft.discard(freshPay())
    }
  }

  return (
    <div className="stack-lg">
      <BalanceCards status={status.data} />
      <OpenBills shopId={shop.id} />
      <Alert msg={msg} />
      <div className="card stack">
        <h2>{t('khata.recordPayment')}</h2>
        <DraftNote show={draft.restored} onFresh={() => draft.discard(freshPay())} />
        <fieldset className="days"><legend className="sr-only">{t('driver.payMode')}</legend>
          {(['cash', 'upi'] as const).map((m) => <label key={m} className="day-toggle"><input type="radio" name="kmode" checked={mode === m} onChange={() => setMode(m)} /><span>{m === 'cash' ? t('driver.cash') : 'UPI'}</span></label>)}
        </fieldset>
        <div className="form-grid">
          <label className="field"><span>{t('driver.amountReceived')}</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></label>
          {mode === 'upi' ? <label className="field"><span>{t('driver.upiRef')}</span><input maxLength={40} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
            : <label className="field"><span>{t('khata.note')} <span className="hint">({t('common.optional')})</span></span><input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></label>}
          <PaidIntoSelect value={account} mode={mode} onChange={setAccount} id="khata-paid-into" />
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
