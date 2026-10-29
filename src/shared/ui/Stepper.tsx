import { Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Quantity stepper sized for thumbs. Shows "Add" when empty, like quick-commerce apps. */
export function Stepper({ value, onChange, label, max = 999 }: { value: number; onChange: (n: number) => void; label: string; max?: number }) {
  const { t } = useTranslation()
  if (value === 0) {
    return <button type="button" className="stepper-add" onClick={() => onChange(1)} aria-label={`${t('shop.add')}: ${label}`}>{t('shop.add')}</button>
  }
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label={t('shop.less', { item: label })}><Minus size={18} /></button>
      <input type="number" inputMode="numeric" min={0} max={max} value={value} aria-label={t('shop.qtyOf', { item: label })}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)} onFocus={(e) => e.target.select()} />
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={t('shop.more', { item: label })}><Plus size={18} /></button>
    </div>
  )
}
