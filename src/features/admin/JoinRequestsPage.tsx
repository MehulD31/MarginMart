import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Inbox, MapPin, Phone, X } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Skeleton, type Msg } from '../../shared/ui/kit'

interface JoinRequest { id: string; phone: string; shop_name: string; owner_name: string; address: string; created_at: string }

export default function JoinRequestsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [msg, setMsg] = useState<Msg>(null)

  const list = useQuery({
    queryKey: ['join_requests', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase.from('join_requests').select('*').eq('status', 'pending').order('created_at')
      if (error) throw error
      return data as JoinRequest[]
    },
  })

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      const { error } = await supabase.rpc('review_join_request', { p_id: id, p_status: status })
      if (error) throw error
      return status
    },
    onSuccess: (status) => {
      setMsg(status === 'approved' ? { kind: 'success', text: t('joinRequests.approvedNote') } : null)
      void qc.invalidateQueries({ queryKey: ['join_requests'] })
    },
    onError: (err) => setMsg({ kind: 'error', text: errorMessage(t, err) }),
  })

  return (
    <section className="stack-lg">
      <PageHeader title={t('joinRequests.title')} sub={t('joinRequests.sub')} />
      <Alert msg={msg} />
      {list.isLoading ? <Skeleton /> : list.data?.length === 0 ? (
        <div className="card"><Empty icon={<Inbox size={26} />} title={t('joinRequests.empty')}><p>{t('joinRequests.emptyHint')}</p></Empty></div>
      ) : (
        <div className="pack-grid">
          {list.data?.map((r) => (
            <article key={r.id} className="card stack">
              <div className="row-between">
                <h2>{r.shop_name}</h2>
                <span className="muted nowrap">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                <p>{r.owner_name}</p>
                <a className="row" href={`tel:+91${r.phone}`}><Phone size={16} aria-hidden="true" /><span className="num">{r.phone}</span></a>
                <p className="row muted" style={{ alignItems: 'flex-start' }}><MapPin size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />{r.address}</p>
              </div>
              <div className="row" style={{ marginTop: 4 }}>
                <button type="button" className="primary grow" disabled={review.isPending}
                  onClick={() => review.mutate({ id: r.id, status: 'approved' })}><Check size={18} aria-hidden="true" />{t('joinRequests.approve')}</button>
                <button type="button" className="danger grow" disabled={review.isPending}
                  onClick={() => review.mutate({ id: r.id, status: 'rejected' })}><X size={18} aria-hidden="true" />{t('joinRequests.reject')}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
