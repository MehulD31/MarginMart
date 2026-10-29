import { useTranslation } from 'react-i18next'
import { ArrowDownLeft, ArrowUpRight, BookOpen, RotateCcw } from 'lucide-react'
import { formatPaise } from '../money'
import { withRunning, type CreditStatus, type LedgerEntry } from '../ledger'
import { Empty, Skeleton } from './kit'

export function BalanceCards({ status }: { status?: CreditStatus }) {
  const { t } = useTranslation()
  if (!status) return <div className="skeleton" style={{ minHeight: 96 }} />
  const due = status.balance_paise
  return (
    <div className="stats">
      <div className={`stat kpi ${due > 0 ? 'kpi-amber' : 'kpi-green'}`}>
        <div className="label">{due < 0 ? t('khata.advance') : t('khata.due')}</div>
        <div className="value num">{formatPaise(Math.abs(due))}</div>
        <div className="cell-sub">{status.credit_limit_paise > 0 ? t('khata.limit', { amount: formatPaise(status.credit_limit_paise) }) : t('khata.noLimit')}</div>
      </div>
      <div className={`stat kpi ${status.overdue_paise > 0 ? 'kpi-amber' : 'kpi-green'}`}>
        <div className="label">{t('khata.overdue')}</div>
        <div className="value num">{formatPaise(status.overdue_paise)}</div>
        <div className="cell-sub">{status.overdue_paise > 0 ? t('khata.payNow') : t('khata.onTime')}</div>
      </div>
    </div>
  )
}

const ICON = { invoice: ArrowUpRight, opening: ArrowUpRight, adjustment: RotateCcw, reversal: RotateCcw, payment: ArrowDownLeft }

/** Khata: newest first, with the running balance after each entry. */
export function LedgerList({ entries, loading, onVoid }: { entries?: LedgerEntry[]; loading: boolean; onVoid?: (e: LedgerEntry) => void }) {
  const { t, i18n } = useTranslation()
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'
  if (loading) return <Skeleton rows={4} />
  if (!entries?.length) return <div className="card"><Empty icon={<BookOpen size={26} />} title={t('khata.empty')} /></div>
  const voided = new Set(entries.filter((e) => e.reverses_id).map((e) => e.reverses_id))
  return (
    <ul className="plain-list ledger card card-flush">
      {withRunning(entries).map((e) => {
        const Icon = ICON[e.type]
        const credit = e.amount_paise < 0
        return (
          <li key={e.id} className={voided.has(e.id) ? 'dim' : ''}>
            <span className={`ledger-icon ${credit ? 'in' : 'out'}`} aria-hidden="true"><Icon size={16} /></span>
            <span className="grow">
              <span className="cell-title">{t(`khata.type.${e.type}`)}{e.payment_mode ? ` · ${e.payment_mode === 'cash' ? t('driver.cash') : 'UPI'}` : ''}{voided.has(e.id) ? ` · ${t('khata.voided')}` : ''}</span>
              <span className="cell-sub">{new Date(e.created_at).toLocaleString(loc, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{e.note ? ` · ${e.note}` : ''}{e.upi_ref ? ` · ${e.upi_ref}` : ''}</span>
            </span>
            <span className="ledger-amt">
              <strong className={`num ${credit ? 'text-ok' : ''}`}>{credit ? '−' : '+'}{formatPaise(Math.abs(e.amount_paise))}</strong>
              <span className="cell-sub num">{formatPaise(e.running)}</span>
            </span>
            {onVoid && e.type !== 'reversal' && !voided.has(e.id) && <button type="button" className="btn-sm ghost" onClick={() => onVoid(e)}>{t('khata.void')}</button>}
          </li>)
      })}
    </ul>
  )
}
