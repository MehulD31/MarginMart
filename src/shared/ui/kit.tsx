import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleAlert, CircleCheck, X, Zap } from 'lucide-react'

export function Brand({ size = 18 }: { size?: number }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true"><Zap size={size} strokeWidth={2.5} fill="currentColor" /></span>
      <span>Margin<b>Mart</b></span>
    </span>
  )
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export type Msg = { kind: 'error' | 'success' | 'warn'; text: string } | null

export function Alert({ msg }: { msg: Msg }) {
  if (!msg) return null
  const Icon = msg.kind === 'success' ? CircleCheck : CircleAlert
  return (
    <div className={`alert alert-${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" /><span>{msg.text}</span>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      {children}
    </div>
  )
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  const { t } = useTranslation()
  return (
    <div className="stack" aria-busy="true" aria-label={t('common.loading')}>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" />)}
    </div>
  )
}

/**
 * Native <dialog>: bottom sheet on phones, centred modal on laptops.
 * Gives focus trapping, Esc to close and background inertness for free.
 */
export function Sheet({ open, title, onClose, children, wide }: {
  open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className={`sheet${wide ? ' wide' : ''}`} onClose={(e) => { if (e.target === e.currentTarget) onClose() }} aria-labelledby={titleId}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {open && <>
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ghost icon-btn" onClick={onClose} aria-label={t('common.close')}><X size={20} /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </>}
    </dialog>
  )
}

export function StatusBadge({ active }: { active: boolean }) {
  const { t } = useTranslation()
  return <span className={`badge ${active ? 'badge-green' : ''}`}>{active ? t('users.active') : t('users.inactive')}</span>
}