import { useTranslation } from 'react-i18next'
import { defaultAccount, useMoneyAccounts } from './money'

/** "Paid into" picker. Lists active accounts; the default for the payment mode is marked. */
export function PaidIntoSelect({ value, mode, onChange, id = 'paid-into' }: { value: string; mode: 'cash' | 'upi'; onChange: (id: string) => void; id?: string }) {
  const { t } = useTranslation()
  const accounts = useMoneyAccounts()
  const def = defaultAccount(accounts.data, mode)
  const list = (accounts.data ?? []).filter((a) => a.active || a.id === value)
  return (
    <label className="field" htmlFor={id}><span>{t('money.paidInto')}</span>
      <select id={id} value={value || def} onChange={(e) => onChange(e.target.value)} disabled={accounts.isLoading}>
        {list.map((a) => <option key={a.id} value={a.id}>{a.name}{a.id === def ? ` ${t('money.default')}` : ''}</option>)}
      </select>
    </label>
  )
}
