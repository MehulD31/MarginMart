import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Store } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { callFunction } from '../../shared/api/functions'
import { errorMessage } from '../../shared/ui/errors'
import { Alert } from '../../shared/ui/kit'
import { PinIssued, type Issued } from './PinIssued'

export interface NewShop { id: string; name: string; phone: string | null; locality: string | null; owner_name: string | null }

/** Add a shop from the sale screen. All four fields required. Goes under "Direct sales"; app login only if ticked. */
export function NewShopForm({ initialName = '', onDone, onCancel }: { initialName?: string; onDone: (s: NewShop) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [f, setF] = useState({ name: initialName, owner: '', phone: '', area: '' })
  const [login, setLogin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ shop: NewShop; pin: Issued } | null>(null)
  const phoneOk = /^[6-9]\d{9}$/.test(f.phone)
  const ok = f.name.trim().length >= 2 && f.owner.trim().length >= 2 && phoneOk && f.area.trim().length >= 2

  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!ok) return
    setBusy(true); setErr(null)
    try {
      const dup = await must<{ name: string }[]>(supabase.from('shop').select('name').eq('phone', f.phone).limit(1))
      if (dup.length) throw new Error(t('newShop.phoneUsed', { name: dup[0].name }))
      const route = await must<{ id: string }[]>(supabase.from('route').select('id').eq('name', 'Direct sales').limit(1))
      const [s] = await must<NewShop[]>(supabase.from('shop').insert({
        name: f.name.trim(), owner_name: f.owner.trim(), phone: f.phone, locality: f.area.trim(), route_id: route[0].id, stop_seq: 0,
      }).select('id, name, phone, locality, owner_name'))
      void qc.invalidateQueries({ queryKey: ['shop'] })
      if (login) {
        try {
          const res = await callFunction<{ pin: string }>('admin-users', { action: 'create', role: 'shop', name: f.owner.trim(), phone: f.phone, shop_id: s.id })
          setIssued({ shop: s, pin: { name: s.name, phone: f.phone, pin: res.pin } }); return
        } catch (e2) { setErr(t('newShop.loginFailed', { msg: errorMessage(t, e2) })); onDone(s); return }
      }
      onDone(s)
    } catch (e1) { setErr(e1 instanceof Error && !/^[A-Z_]+$/.test(e1.message) ? e1.message : errorMessage(t, e1)) } finally { setBusy(false) }
  }

  if (issued) return <PinIssued issued={[issued.pin]} onDone={() => onDone(issued.shop)} />

  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v })
  return (
    <form className="card stack" onSubmit={submit} noValidate data-testid="new-shop-form" style={{ padding: '12px' }}>
      <span className="cell-title row"><Store size={18} aria-hidden="true" />{t('newShop.title')}</span>
      <div className="form-grid">
        <label className="field"><span>{t('newShop.name')} *</span><input autoFocus maxLength={100} value={f.name} onChange={(e) => set('name')(e.target.value)} /></label>
        <label className="field"><span>{t('newShop.owner')} *</span><input maxLength={100} value={f.owner} onChange={(e) => set('owner')(e.target.value)} /></label>
        <label className="field"><span>{t('newShop.phone')} *</span>
          <input type="tel" inputMode="numeric" maxLength={10} value={f.phone} aria-invalid={f.phone.length > 0 && !phoneOk}
            onChange={(e) => set('phone')(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="field"><span>{t('newShop.area')} *</span><input maxLength={80} value={f.area} onChange={(e) => set('area')(e.target.value)} /></label>
      </div>
      {f.phone.length > 0 && !phoneOk && <p className="cell-sub text-warn">{t('newShop.badPhone')}</p>}
      <label className="chip" style={{ alignSelf: 'flex-start' }}><input type="checkbox" checked={login} onChange={(e) => setLogin(e.target.checked)} />{t('newShop.login')}</label>
      <Alert msg={err ? { kind: 'error', text: err } : null} />
      <div className="row" style={{ gap: 8 }}>
        <button type="button" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="submit" className="primary" disabled={busy || !ok}>{busy ? t('common.loading') : t('newShop.save')}</button>
      </div>
    </form>
  )
}
