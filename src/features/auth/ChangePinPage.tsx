import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../shared/api/auth'
import { callFunction } from '../../shared/api/functions'
import { errorMessage } from '../../shared/ui/errors'
import { Alert } from '../../shared/ui/kit'
import { AuthLayout } from './AuthLayout'

/** Shown after login whenever profiles.must_change_pin is true (first login or after a reset). */
export default function ChangePinPage() {
  const { t } = useTranslation()
  const { profile, refreshProfile, signOut } = useAuth()
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (pin !== confirm) { setError(t('changePin.mismatch')); return }
    setBusy(true)
    setError(null)
    try {
      await callFunction('admin-users', { action: 'change_pin', new_pin: pin })
      await refreshProfile()
    } catch (err) {
      setError(errorMessage(t, err))
    } finally {
      setBusy(false)
    }
  }

  const digits = (v: string) => v.replace(/\D/g, '')
  return (
    <AuthLayout foot={<button type="button" className="ghost" onClick={() => void signOut()}>{t('nav.logout')}</button>}>
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <div className="icon-tile" aria-hidden="true"><KeyRound size={24} /></div>
        <div>
          <h1>{t('changePin.title')}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t('changePin.hello', { name: profile?.name ?? '' })} {t('changePin.intro')}</p>
        </div>
        <label className="field"><span>{t('changePin.newPin')}</span>
          <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} className="pin"
            value={pin} onChange={(e) => setPin(digits(e.target.value))} /></label>
        <label className="field"><span>{t('changePin.confirmPin')}</span>
          <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} className="pin"
            value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} /></label>
        <Alert msg={error ? { kind: 'error', text: error } : null} />
        <button type="submit" className="primary btn-block" disabled={busy || pin.length !== 6 || confirm.length !== 6}>
          {busy ? t('common.loading') : t('changePin.submit')}
        </button>
      </form>
    </AuthLayout>
  )
}
