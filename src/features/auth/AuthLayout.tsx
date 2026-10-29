import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IndianRupee, ShieldCheck, Truck, Zap } from 'lucide-react'
import { Brand } from '../../shared/ui/kit'
import { LanguageToggle } from '../../shared/ui/LanguageToggle'

/** Split layout on laptops (brand panel + form), single column on phones. */
export function AuthLayout({ children, top, foot }: { children: ReactNode; top?: ReactNode; foot?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="auth">
      <aside className="auth-hero on-dark" aria-hidden="true">
        <Brand />
        <div>
          <h2>{t('auth.heroTitle')}</h2>
          <p>{t('auth.heroText')}</p>
          <ul className="hero-points">
            <li><span><Zap size={18} /></span><span>{t('auth.point1')}</span></li>
            <li><span><Truck size={18} /></span><span>{t('auth.point2')}</span></li>
            <li><span><IndianRupee size={18} /></span><span>{t('auth.point3')}</span></li>
          </ul>
        </div>
        <p className="row" style={{ fontSize: '0.85rem' }}><ShieldCheck size={16} />{t('auth.secure')}</p>
      </aside>
      <main className="auth-main">
        <div className="auth-top">{top ?? <Brand />}<LanguageToggle /></div>
        {children}
        {foot && <div className="auth-foot">{foot}</div>}
      </main>
    </div>
  )
}
