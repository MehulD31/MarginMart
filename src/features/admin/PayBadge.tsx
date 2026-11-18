import { useTranslation } from 'react-i18next'
import { formatPaise } from '../../shared/money'

/** How a bill was paid: cash / UPI when fully paid, otherwise "Not paid" or "Part paid". */
export function PayBadge({ total, paid, mode }: { total: number; paid?: number; mode: 'cash' | 'upi' }) {
  const { t } = useTranslation()
  const got = paid ?? total
  if (got >= total) return <span className={`badge ${mode === 'upi' ? 'badge-blue' : 'badge-green'}`}>{mode === 'upi' ? 'UPI' : t('driver.cash')}</span>
  if (got <= 0) return <span className="badge badge-red" data-testid="pay-badge">{t('sales.form.notPaid', { due: formatPaise(total) })}</span>
  return <span className="badge badge-amber" data-testid="pay-badge">{t('sales.form.partPaid', { paid: formatPaise(got), due: formatPaise(total - got) })}</span>
}
