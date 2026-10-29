import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { History } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { Empty, PageHeader, Skeleton } from '../../shared/ui/kit'

interface AuditRow { id: number; actor: string | null; table_name: string; row_id: string | null; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; at: string }

const TABLES = ['', 'orders', 'price_list_item', 'price_list', 'shop', 'profiles', 'pin_record', 'cash_handover', 'invoice', 'settings', 'pack', 'variant', 'load_line']
const NOISE = new Set(['updated_at', 'created_at', 'id'])

/** Fields that actually changed, as "field: old → new". */
function changes(r: AuditRow): string[] {
  if (r.action === 'view') return []
  const keys = new Set([...Object.keys(r.before ?? {}), ...Object.keys(r.after ?? {})])
  const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 40))
  return [...keys].filter((k) => !NOISE.has(k) && JSON.stringify(r.before?.[k]) !== JSON.stringify(r.after?.[k]))
    .slice(0, 6).map((k) => (r.action === 'insert' ? `${k}: ${show(r.after?.[k])}` : `${k}: ${show(r.before?.[k])} → ${show(r.after?.[k])}`))
}

export default function AuditPage() {
  const { t, i18n } = useTranslation()
  const [table, setTable] = useState('')
  const log = useQuery({
    queryKey: ['audit', table],
    queryFn: () => {
      let q = supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(150)
      if (table) q = q.eq('table_name', table)
      return must<AuditRow[]>(q)
    },
  })
  const people = useQuery({ queryKey: ['profiles', 'names'], queryFn: () => must<{ user_id: string; name: string }[]>(supabase.from('profiles').select('user_id, name')) })
  const who = new Map(people.data?.map((p) => [p.user_id, p.name]))
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'

  return (
    <section className="stack-lg">
      <PageHeader title={t('audit.title')} sub={t('audit.sub')} />
      <label className="field" style={{ maxWidth: 280 }}><span>{t('audit.what')}</span>
        <select value={table} onChange={(e) => setTable(e.target.value)}>
          {TABLES.map((x) => <option key={x} value={x}>{x ? t(`audit.table.${x}`) : t('common.all')}</option>)}
        </select></label>
      {log.isLoading ? <Skeleton rows={6} /> : !log.data?.length ? <div className="card"><Empty icon={<History size={26} />} title={t('audit.empty')} /></div> : (
        <div className="table-wrap"><table className="table-stack">
          <thead><tr><th scope="col">{t('audit.when')}</th><th scope="col">{t('audit.who')}</th><th scope="col">{t('audit.what')}</th><th scope="col">{t('audit.change')}</th></tr></thead>
          <tbody>{log.data.map((r) => (
            <tr key={r.id}>
              <td className="lead num nowrap">{new Date(r.at).toLocaleString(loc, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
              <td data-label={t('audit.who')}>{r.actor ? who.get(r.actor) ?? t('audit.someone') : t('audit.system')}</td>
              <td data-label={t('audit.what')}><span className={`badge ${r.action === 'delete' ? 'badge-red' : r.action === 'view' ? 'badge-amber' : r.action === 'insert' ? 'badge-green' : 'badge-blue'}`}>{t(`audit.action.${r.action}`, { defaultValue: r.action })}</span> {t(`audit.table.${r.table_name}`, { defaultValue: r.table_name })}</td>
              <td data-label={t('audit.change')} className="cell-sub">{changes(r).join(' · ') || '—'}</td>
            </tr>))}
          </tbody>
        </table></div>
      )}
    </section>
  )
}
