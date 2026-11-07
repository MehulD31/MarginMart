import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { supabase } from '../api/supabase'
import { useAuth } from '../api/auth'
import { errorMessage } from './errors'
import { useConfirm } from './confirm'

export type DeleteKind = 'counter_sale' | 'order' | 'purchase' | 'user' | 'route' | 'vehicle' | 'scheme' | 'pack' | 'variant' | 'supplier' | 'join_request'

/**
 * Admin-only Delete. Asks first, then calls admin_delete (which refuses when something still depends on the record,
 * and puts stock back where the record moved stock). Renders nothing for managers / drivers / shops.
 */
export function DeleteButton({ kind, id, name, invalidate, onDone, onError, className = '' }: {
  kind: DeleteKind; id: string; name: string; invalidate: string[]
  onDone?: (text: string) => void; onError?: (text: string) => void; className?: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const isAdmin = useAuth().profile?.role === 'admin'
  const [busy, setBusy] = useState(false)
  if (!isAdmin) return null

  const run = async () => {
    if (!(await confirm({ title: t('del.title', { name }), body: t(`del.body.${kind}`), confirm: t('common.delete'), danger: true }))) return
    setBusy(true)
    const { error } = await supabase.rpc('admin_delete', { p_kind: kind, p_id: id })
    setBusy(false)
    if (error) { onError?.(errorMessage(t, error)); return }
    for (const k of invalidate) void qc.invalidateQueries({ queryKey: [k] })
    onDone?.(t('del.done', { name }))
  }
  return (
    <button type="button" className={`btn-sm danger ${className}`.trim()} disabled={busy} onClick={() => void run()} aria-label={`${t('common.delete')}: ${name}`}>
      <Trash2 size={16} aria-hidden="true" />{busy ? t('common.loading') : t('common.delete')}
    </button>
  )
}
