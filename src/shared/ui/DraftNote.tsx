import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** "Your unsaved work came back" line with a way to start again from scratch. Shown only when a draft was restored. */
export function DraftNote({ show, onFresh }: { show: boolean; onFresh: () => void }) {
  const { t } = useTranslation()
  if (!show) return null
  return (
    <div className="alert draft-note" role="status" data-testid="draft-note">
      <span className="grow">{t('draft.restored')}</span>
      <button type="button" className="btn-sm" onClick={onFresh}><RotateCcw size={16} aria-hidden="true" />{t('draft.fresh')}</button>
    </div>
  )
}
