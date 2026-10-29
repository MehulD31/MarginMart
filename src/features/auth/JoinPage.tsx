import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CircleCheck } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty } from '../../shared/ui/kit'
import { AuthLayout } from './AuthLayout'

export default function JoinPage() {
  const { t } = useTranslation()
  const [form, setForm] = useState({ phone: '', shop: '', owner: '', address: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.rpc('submit_join_request', {
      p_phone: form.phone, p_shop_name: form.shop, p_owner_name: form.owner, p_address: form.address,
    })
    setBusy(false)
    if (err) setError(errorMessage(t, err))
    else setDone(true)
  }

  const valid = form.phone.length === 10 && form.shop.trim() && form.owner.trim() && form.address.trim()
  const back = <Link to="/login" className="button ghost" style={{ paddingLeft: 4 }}><ArrowLeft size={18} aria-hidden="true" />{t('login.title')}</Link>

  return (
    <AuthLayout top={back}>
      {done ? (
        <div className="auth-card">
          <Empty icon={<CircleCheck size={28} />} title={t('join.doneTitle')}><p>{t('join.done')}</p></Empty>
          <Link to="/login" className="button primary btn-block">{t('login.title')}</Link>
        </div>
      ) : (
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          <div>
            <h1>{t('join.title')}</h1>
            <p className="muted" style={{ marginTop: 6 }}>{t('join.intro')}</p>
          </div>
          <label className="field"><span>{t('join.shopName')}</span>
            <input required maxLength={100} autoComplete="organization" value={form.shop} onChange={(e) => set('shop')(e.target.value)} /></label>
          <label className="field"><span>{t('join.ownerName')}</span>
            <input required maxLength={100} autoComplete="name" value={form.owner} onChange={(e) => set('owner')(e.target.value)} /></label>
          <label className="field"><span>{t('login.phone')}</span>
            <input type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} required value={form.phone}
              onChange={(e) => set('phone')(e.target.value.replace(/\D/g, ''))} /></label>
          <label className="field"><span>{t('join.address')}</span>
            <textarea required maxLength={300} rows={3} autoComplete="street-address" value={form.address} onChange={(e) => set('address')(e.target.value)} /></label>
          <Alert msg={error ? { kind: 'error', text: error } : null} />
          <button type="submit" className="primary btn-block" disabled={busy || !valid}>
            {busy ? t('common.loading') : t('join.submit')}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
