import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Ban, Save } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { formatPaise } from '../../shared/money'
import { netRate } from '../../shared/pricing'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Skeleton, type Msg } from '../../shared/ui/kit'
import { Stepper } from '../../shared/ui/Stepper'
import { ProductImage } from '../../shared/ui/ProductImage'
import { setQty, type Cart } from '../shop/cart'
import { useShopCatalog } from '../shop/data'
import { CANCEL_REASONS } from './opsData'

/** Staff editor for one shop's order on one delivery day. Saves through save_order, so the same rules apply. */
export function OrderEditor({ shopId, shopName, planId, initial, orderId, editable, onDone }: {
  shopId: string; shopName: string; planId: string; initial: Cart; orderId?: string; editable: boolean; onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const catalog = useShopCatalog()
  const [cart, setCart] = useState<Cart>(initial)
  const [q, setQ] = useState('')
  const [reason, setReason] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const hi = i18n.language === 'hi'

  const rows = useMemo(() => (catalog.data ?? []).flatMap((it) => it.variants.map((v) => {
    const pack = (hi && it.pack.name_hi) || it.pack.name_en
    const fl = (hi && v.flavour_hi) || v.flavour_en
    return { id: v.id, img: v.image_path, key: `{v.flavour_en} {it.pack.name_en}`, name: it.variants.length === 1 && v.flavour_en === it.pack.name_en ? pack : `${fl} · ${pack}`, rate: netRate(it.price) }
  })), [catalog.data, hi])
  const rate = new Map(rows.map((r) => [r.id, r.rate]))
  const total = Object.entries(cart).reduce((s, [id, n]) => s + n * (rate.get(id) ?? 0), 0)
  const cases = Object.values(cart).reduce((s, n) => s + n, 0)
  const shown = rows.filter((r) => cart[r.id] || (q && r.name.toLowerCase().includes(q.toLowerCase())))

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin-orders'] }); void qc.invalidateQueries({ queryKey: ['route-load'] }) }
  const save = async () => {
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('save_order', {
      p_lines: Object.entries(cart).map(([variant_id, qty]) => ({ variant_id, qty })), p_shop_id: shopId, p_plan_id: planId,
    })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: errorMessage(t, error) }); else { refresh(); onDone() }
  }
  const cancel = async () => {
    if (!orderId || !reason) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('cancel_order', { p_order_id: orderId, p_reason: t(`orders.reason.${reason}`, { lng: 'en' }) })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: errorMessage(t, error) }); else { refresh(); onDone() }
  }

  if (catalog.isLoading) return <Skeleton rows={4} />
  return (
    <div className="stack-lg">
      <p className="muted">{shopName}</p>
      {editable && <input type="search" aria-label={t('orders.addItem')} placeholder={t('orders.addItem')} value={q} onChange={(e) => setQ(e.target.value)} />}
      {shown.length === 0 ? <p className="muted">{t('orders.emptyEditor')}</p> : (
        <ul className="plain-list">{shown.map((r) => (
          <li key={r.id} className="cart-line">
            <ProductImage path={r.img} name={r.key} size={44} />
            <div className="grow"><div className="cell-title">{r.name}</div>
              <div className="cell-sub num">{formatPaise(r.rate)}{cart[r.id] ? ` × ${cart[r.id]} = ${formatPaise(r.rate * cart[r.id])}` : ''}</div></div>
            {editable ? <Stepper value={cart[r.id] ?? 0} onChange={(n) => setCart((c) => setQty(c, r.id, n))} label={r.name} />
              : <strong className="num">{cart[r.id]}</strong>}
          </li>))}
        </ul>
      )}
      <div className="row-between total-row"><span>{t('shop.casesCount', { count: cases })}</span><strong className="num">{formatPaise(total)}</strong></div>
      <Alert msg={msg} />
      {!editable && <Alert msg={{ kind: 'warn', text: t('orders.lockedNote') }} />}
      {editable && orderId && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field grow"><span>{t('orders.cancelReason')}</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">{t('orders.chooseReason')}</option>
              {CANCEL_REASONS.map((r) => <option key={r} value={r}>{t(`orders.reason.${r}`)}</option>)}
            </select></label>
          <button type="button" className="danger" disabled={busy || !reason} onClick={() => void cancel()}><Ban size={18} aria-hidden="true" />{t('shop.cancel')}</button>
        </div>
      )}
      {editable && (
        <div className="sheet-foot">
          <button type="button" onClick={onDone}>{t('common.cancel')}</button>
          <button type="button" className="primary" disabled={busy || cases === 0} onClick={() => void save()}><Save size={18} aria-hidden="true" />{busy ? t('common.loading') : t('orders.save')}</button>
        </div>
      )}
    </div>
  )
}
