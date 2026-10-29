import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Phone, Plus } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must, type Shop } from '../../shared/api/db'
import { formatPaise } from '../../shared/money'
import { Empty, PageHeader, Sheet, Skeleton } from '../../shared/ui/kit'
import { OrderEditor } from './OrderEditor'
import { isLive, linesCases, linesTotal, planDates, useOrdersFor, usePlans, type AdminOrder, type Plan } from './opsData'
import { useLocaleDate } from './opsData'

export function DateChips({ dates, value, onChange }: { dates: string[]; value: string; onChange: (d: string) => void }) {
  const { t } = useTranslation()
  const fmt = useLocaleDate()
  return (
    <div className="segmented" role="tablist" aria-label={t('orders.deliveryDay')}>
      {dates.map((d) => <button key={d} type="button" role="tab" className="btn-sm" aria-selected={value === d} onClick={() => onChange(d)}>{fmt(d)}</button>)}
    </div>
  )
}

const STATUS_BADGE: Record<AdminOrder['status'], string> = { placed: 'badge-blue', locked: 'badge-amber', delivered: 'badge-green', partially_delivered: 'badge-green', cancelled: '' }

export default function OrdersPage() {
  const { t } = useTranslation()
  const fmt = useLocaleDate()
  const plans = usePlans()
  const dates = planDates(plans.data ?? [])
  const [date, setDate] = useState<string | null>(null)
  const day = date ?? dates[0] ?? ''
  const dayPlans = (plans.data ?? []).filter((p) => p.date === day)
  const [route, setRoute] = useState('')
  const orders = useOrdersFor(dayPlans.map((p) => p.id))
  const [open, setOpen] = useState<{ order?: AdminOrder; shop?: Shop; plan: Plan } | null>(null)
  const [picking, setPicking] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)

  const planById = new Map(dayPlans.map((p) => [p.id, p]))
  const forRoute = (orders.data ?? []).filter((o) => !route || planById.get(o.route_day_plan_id)?.route_id === route)
  const cancelledCount = forRoute.filter((o) => !isLive(o)).length
  const list = forRoute.filter((o) => showCancelled || isLive(o)).sort((a, b) => a.shop.stop_seq - b.shop.stop_seq)
  const live = list.filter(isLive)

  return (
    <section className="stack-lg">
      <PageHeader title={t('orders.title')} sub={day ? t('orders.sub', { date: fmt(day, true), n: live.length, total: formatPaise(live.reduce((s, o) => s + linesTotal(o), 0)) }) : undefined}
        actions={<button type="button" className="primary" disabled={!dayPlans.length} onClick={() => setPicking(true)}><Plus size={18} aria-hidden="true" />{t('orders.new')}</button>} />
      {plans.isLoading ? <Skeleton rows={2} /> : <DateChips dates={dates} value={day} onChange={(d) => { setDate(d); setRoute('') }} />}
      {dayPlans.length > 1 && (
        <div className="segmented" role="tablist" aria-label={t('shops.route')}>
          {[{ route_id: '', route: { name: t('common.all') } }, ...dayPlans].map((p) => (
            <button key={p.route_id || 'all'} type="button" role="tab" className="btn-sm" aria-selected={route === p.route_id} onClick={() => setRoute(p.route_id)}>{p.route.name}</button>))}
        </div>
      )}
      {cancelledCount > 0 && <label className="chip"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />{t('orders.showCancelled', { n: cancelledCount })}</label>}
      {orders.isLoading ? <Skeleton rows={4} /> : list.length === 0 ? (
        <div className="card"><Empty icon={<ClipboardList size={26} />} title={t('orders.empty')}><p>{t('orders.emptyHint')}</p></Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="table-stack">
            <thead><tr><th scope="col">{t('shops.name')}</th><th scope="col">{t('orders.cases')}</th><th scope="col">{t('shop.total')}</th><th scope="col">{t('users.status')}</th><th scope="col"><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
            <tbody>{list.map((o) => (
              <tr key={o.id} className={isLive(o) ? '' : 'dim'}>
                <td className="lead"><div className="cell-title">{o.shop.name}</div>
                  <div className="cell-sub">{planById.get(o.route_day_plan_id)?.route.name} · #{o.shop.stop_seq} · {t(`orders.source.${o.source}`)}</div></td>
                <td data-label={t('orders.cases')} className="num">{linesCases(o)}</td>
                <td data-label={t('shop.total')} className="num"><strong>{formatPaise(linesTotal(o))}</strong></td>
                <td data-label={t('users.status')}><span className={`badge ${STATUS_BADGE[o.status]}`}>{t(`shop.status.${o.status}`)}</span>
                  {o.cancel_reason && o.status === 'cancelled' && <div className="cell-sub">{o.cancel_reason}</div>}</td>
                <td className="actions">
                  {o.shop.phone && <a className="button btn-sm" href={`tel:+91${o.shop.phone}`} aria-label={`${t('shops.call')} ${o.shop.name}`}><Phone size={16} aria-hidden="true" /></a>}
                  <button type="button" className="btn-sm" onClick={() => setOpen({ order: o, plan: planById.get(o.route_day_plan_id)! })}>{o.status === 'placed' ? t('common.edit') : t('common.view')}</button>
                </td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={picking} title={t('orders.pickShop')} onClose={() => setPicking(false)}>
        {picking && <ShopPicker plans={dayPlans} onPick={(shop, plan) => {
          setPicking(false)
          const existing = (orders.data ?? []).find((o) => o.shop_id === shop.id && o.status === 'placed' && o.route_day_plan_id === plan.id)
          setOpen({ order: existing, shop, plan })
        }} />}
      </Sheet>
      <Sheet open={!!open} wide title={open ? `${open.order?.shop.name ?? open.shop?.name} · ${fmt(open.plan.date)}` : ''} onClose={() => setOpen(null)}>
        {open && <OrderEditor key={open.order?.id ?? open.shop?.id}
          shopId={open.order?.shop_id ?? open.shop!.id} shopName={`${open.plan.route.name} · ${fmt(open.plan.date, true)}`} planId={open.plan.id}
          orderId={open.order?.status === 'placed' ? open.order.id : undefined}
          initial={Object.fromEntries((open.order?.order_line ?? []).map((l) => [l.variant_id, l.qty_ordered]))}
          editable={open.plan.status === 'planning' && (!open.order || open.order.status === 'placed')}
          onDone={() => setOpen(null)} />}
      </Sheet>
    </section>
  )
}

/** Only shops whose route delivers on the selected day can be picked. */
function ShopPicker({ plans, onPick }: { plans: Plan[]; onPick: (s: Shop, p: Plan) => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const routeIds = plans.map((p) => p.route_id)
  const shops = useQuery({
    queryKey: ['shop', 'by-route', routeIds],
    queryFn: () => must<Shop[]>(supabase.from('shop').select('*').in('route_id', routeIds).eq('active', true).order('stop_seq').order('name')),
  })
  const planFor = useMemo(() => new Map(plans.map((p) => [p.route_id, p])), [plans])
  const list = (shops.data ?? []).filter((s) => !q || `${s.name} ${s.owner_name ?? ''} ${s.phone ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="stack">
      <input type="search" aria-label={t('shops.searchLabel')} placeholder={t('shops.searchLabel')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {shops.isLoading ? <Skeleton /> : list.length === 0 ? <p className="muted">{t('common.noMatches')}</p> : (
        <ul className="plain-list more-list">{list.map((s) => {
          const p = planFor.get(s.route_id)!
          return (
            <li key={s.id}><button type="button" className="btn-block" disabled={p.status !== 'planning'} onClick={() => onPick(s, p)}>
              <span className="grow" style={{ textAlign: 'left' }}><span className="cell-title">{s.name}</span><span className="cell-sub" style={{ display: 'block' }}>{p.route.name} · #{s.stop_seq}{p.status !== 'planning' ? ` · ${t('orders.truckLoaded')}` : ''}</span></span>
            </button></li>)
        })}</ul>
      )}
    </div>
  )
}
