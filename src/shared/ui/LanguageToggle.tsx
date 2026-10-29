import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../i18n'

export function LanguageToggle({ className = 'ghost' }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const next = i18n.language === 'hi' ? 'en' : 'hi'
  return (
    <button type="button" className={className} lang={next} onClick={() => setLanguage(next)}
      aria-label={next === 'en' ? 'Switch to English' : 'हिंदी में बदलें'}>
      <Languages size={18} aria-hidden="true" />{t('common.language')}
    </button>
  )
}
