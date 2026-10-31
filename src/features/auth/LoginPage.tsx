import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../shared/api/auth'
import { homeFor } from '../../shared/api/functions'
import { errorMessage } from '../../shared/ui/errors'
import { Alert } from '../../shared/ui/kit'
import { AuthLayout } from './AuthLayout'

export default function LoginPage() {
  const { t } = useTranslation()
  const { profile, signIn } = useAuth()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (profile) return <Navigate to={homeFor(profile.role)} replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(phone, pin)
    } catch (err) {
      setError(errorMessage(t, err))
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout foot={<>
      <p className="muted">{t('login.newShop')}</p>
      <Link to="/join" className="button btn-block">{t('login.noAccount')}</Link>
    </>}>
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <div>
          <h1>{t('login.title')}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t('login.subtitle')}</p>
        </div>
        <label className="field">
          <span>{t('login.phone')}</span>
          <input type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} required placeholder="98765 43210"
            value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="field">
          <span>{t('login.pin')}</span>
          <input type="password" inputMode="numeric" autoComplete="current-password" maxLength={4} required
            className="pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </label>
        <Alert msg={error ? { kind: 'error', text: error } : null} />
        <button type="submit" className="primary btn-block" disabled={busy || phone.length !== 10 || pin.length !== 4}>
          {busy ? t('common.loading') : t('login.submit')}
        </button>
        <p className="muted" style={{ textAlign: 'center' }}>{t('login.forgot')}</p>
      </form>
    </AuthLayout>
  )
}
