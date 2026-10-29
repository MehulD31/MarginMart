import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Paged } from './paging'

/** "1–25 of 450" with previous/next. Hidden when everything fits on one page. */
export function Pager({ p }: { p: Pick<Paged, 'page' | 'pages' | 'total' | 'from' | 'to' | 'setPage'> }) {
  const { t } = useTranslation()
  if (p.pages <= 1) return null
  return (
    <nav className="row-between pager" aria-label={t('common.pages')}>
      <span className="muted num">{t('common.showing', { from: p.from, to: p.to, total: p.total })}</span>
      <span className="row" style={{ gap: 6 }}>
        <button type="button" className="btn-sm" disabled={p.page <= 1} onClick={() => p.setPage(p.page - 1)} aria-label={t('common.prev')}><ChevronLeft size={16} aria-hidden="true" /></button>
        <span className="num">{p.page} / {p.pages}</span>
        <button type="button" className="btn-sm" disabled={p.page >= p.pages} onClick={() => p.setPage(p.page + 1)} aria-label={t('common.next')}><ChevronRight size={16} aria-hidden="true" /></button>
      </span>
    </nav>
  )
}
