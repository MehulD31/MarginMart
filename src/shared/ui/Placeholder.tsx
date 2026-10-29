import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LogOut } from 'lucide-react'
import { useAuth } from '../api/auth'
import { Brand, Empty } from './kit'
import { initials } from './util'
import { LanguageToggle } from './LanguageToggle'

/** Mobile app frame for the shop and driver surfaces until their screens land. */
export function AppFrame({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  return (
    <div className="app-screen">
      <header className="mobile-header"><Brand size={16} /><LanguageToggle /></header>
      <main className="stack-lg" style={{ padding: 16 }}>
        <div className="card row">
          <span className="avatar-sm" aria-hidden="true">{initials(profile?.name ?? '')}</span>
          <div className="grow"><div className="cell-title">{profile?.name}</div><div className="cell-sub num">{profile?.phone}</div></div>
        </div>
        <div className="card"><Empty icon={icon} title={title}><p>{text}</p></Empty></div>
        <button type="button" className="danger btn-block" onClick={() => void signOut()}><LogOut size={18} aria-hidden="true" />{t('nav.logout')}</button>
      </main>
    </div>
  )
}
