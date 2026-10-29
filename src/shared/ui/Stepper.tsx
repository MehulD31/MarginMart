import { Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Quantity stepper sized for thumbs. Shows "Add" when empty, like quick-commerce apps.
 *  When `disabled` (e.g. no delivery day yet) the controls are truly inert, not a silent no-op. */
export function Stepper({ value, onChange, label, max = 999, disabled = false }: { value: number; onChange: (n: number) => void; label: string; max?: number; disabled?: boolean }) {
  const { t } = useTranslation()
  if (value === 0) {
    return <button type="button" className="stepper-add" disabled={disabled} onClick={() => onChange(1)} aria-label={`${t('shop.add')}: ${label}`}>{t('shop.add')}</button>
  }
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={disabled} aria-label={t('shop.less', { item: label })}><Minus size={18} /></button>
      <input type="number" inputMode="numeric" min={0} max={max} value={value} disabled={disabled} aria-label={t('shop.qtyOf', { item: label })}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)} onFocus={(e) => e.target.select()} />
      <button type="button" onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label={t('shop.more', { item: label })}><Plus size={18} /></button>
    </div>
  )
}
