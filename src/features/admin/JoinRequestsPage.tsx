import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Inbox, MapPin, Phone, X } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must, useRoutes, type Route, type Shop } from '../../shared/api/db'
import { callFunction } from '../../shared/api/functions'
import { parseRupees } from '../../shared/pricing'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'
import { PinIssued, type Issued } from './PinIssued'

interface JoinRequest { id: string; phone: string; shop_name: string; owner_name: string; address: string; created_at: string }

export default function JoinRequestsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [msg, setMsg] = useState<Msg>(null)
  const [approving, setApproving] = useState<JoinRequest | null>(null)
  const [issued, setIssued] = useState<Issued[]>([])
  const routes = useRoutes()

  const list = useQuery({
    queryKey: ['join_requests', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase.from('join_requests').select('*').eq('status', 'pending').order('created_at')
      if (error) throw error
      return data as JoinRequest[]
    },
  })

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('review_join_request', { p_id: id, p_status: 'rejected' })
      if (error) throw error
    },
    onSuccess: () => { setMsg(null); void qc.invalidateQueries({ queryKey: ['join_requests'] }) },
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
                <button type="button" className="primary grow" disabled={reject.isPending}
                  onClick={() => { setMsg(null); setApproving(r) }}><Check size={18} aria-hidden="true" />{t('joinRequests.approve')}</button>
                <button type="button" className="danger grow" disabled={reject.isPending}
                  onClick={() => reject.mutate(r.id)}><X size={18} aria-hidden="true" />{t('joinRequests.reject')}</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Sheet open={!!approving} wide title={t('joinRequests.approveTitle', { name: approving?.shop_name ?? '' })} onClose={() => setApproving(null)}>
        {approving && routes.data && <ApproveForm req={approving} routes={routes.data}
          onDone={(pin) => {
            setApproving(null)
            if (pin) { setIssued([pin]); setMsg({ kind: 'success', text: t('joinRequests.approvedCreated') }) }
          }} />}
      </Sheet>
      <PinIssued issued={issued} onDone={() => setIssued([])} />
    </section>
  )
}

function ApproveForm({ req, routes, onDone }: { req: JoinRequest; routes: Route[]; onDone: (pin?: Issued) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [f, setF] = useState({
    route_id: routes[0]?.id ?? '', stop_seq: '0', credit_limit: '0', credit_days: '7',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const limit = parseRupees(f.credit_limit)
  const valid = f.route_id && limit !== null && limit >= 0 && Number(f.credit_days) >= 0 && Number(f.credit_days) <= 90

  const approve = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      // Create the shop, then its login. Mark the request approved only after both succeed.
      const [shop] = await must<Shop[]>(supabase.from('shop').insert({
        name: req.shop_name.trim(), owner_name: req.owner_name.trim() || null, phone: req.phone,
        address: req.address?.trim() || null, route_id: f.route_id, stop_seq: Number(f.stop_seq) || 0,
        credit_limit_paise: limit!, credit_days: Number(f.credit_days), active: true,
      }).select())
      const res = await callFunction<{ pin: string }>('admin-users', {
        action: 'create', role: 'shop', name: req.owner_name.trim() || req.shop_name.trim(), phone: req.phone, shop_id: shop.id,
      })
      await supabase.rpc('review_join_request', { p_id: req.id, p_status: 'approved' })
      void qc.invalidateQueries({ queryKey: ['join_requests'] })
      void qc.invalidateQueries({ queryKey: ['shop'] })
      onDone({ name: shop.name, phone: req.phone, pin: res.pin })
    } catch (err) {
      const dup = (err as { code?: string })?.code === '23505' || /shop_phone_unique/.test((err as Error)?.message ?? '')
      setError(dup ? t('errors.SHOP_PHONE_EXISTS') : errorMessage(t, err))
    } finally { setBusy(false) }
  }

  return (
    <form className="stack-lg" onSubmit={approve} noValidate>
      <div className="stack" style={{ gap: 6 }}>
        <p className="row"><Phone size={16} aria-hidden="true" /><span className="num">{req.phone}</span> · {req.owner_name}</p>
        <p className="muted">{t('joinRequests.approveHint')}</p>
      </div>
      <div className="form-grid">
        <label className="field"><span>{t('shops.route')} *</span>
          <select value={f.route_id} onChange={(e) => set('route_id')(e.target.value)}>
            {routes.filter((r) => r.active || r.id === f.route_id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select></label>
        <label className="field"><span>{t('shops.stopSeq')} <span className="hint">{t('shops.stopHint')}</span></span>
          <input type="number" inputMode="numeric" min={0} value={f.stop_seq} onChange={(e) => set('stop_seq')(e.target.value)} /></label>
        <label className="field"><span>{t('shops.creditLimit')}</span>
          <input type="text" inputMode="numeric" value={f.credit_limit} onChange={(e) => set('credit_limit')(e.target.value)} /></label>
        <label className="field"><span>{t('shops.creditDays')}</span>
          <input type="number" inputMode="numeric" min={0} max={90} value={f.credit_days} onChange={(e) => set('credit_days')(e.target.value)} /></label>
      </div>
      <Alert msg={error ? { kind: 'error', text: error } : null} />
      <div className="sheet-foot">
        <button type="button" onClick={() => onDone()}>{t('common.cancel')}</button>
        <button type="submit" className="primary" disabled={busy || !valid}>{busy ? t('common.loading') : t('joinRequests.approveCreate')}</button>
      </div>
    </form>
  )
}
