import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Banknote, CircleCheck, Clock, Package, Radio, Smartphone, Truck } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { formatPaise } from '../../shared/money'
import { Empty, PageHeader, Skeleton } from '../../shared/ui/kit'
import { todayIST, useLocaleDate } from './opsData'

interface LPlan { id: string; date: string; status: string; route: { name: string }; vehicle: { name: string } | null }
interface LOrder { id: string; status: string; shop_id: string; route_day_plan_id: string; shop: { name: string; stop_seq: number }; order_line: { qty_ordered: number; unit_price_paise: number }[] }
interface LInvoice { id: string; number: string; shop_id: string; route_day_plan_id: string; total_paise: number; created_at: string; shop: { name: string }; delivery_line: { qty_delivered: number }[] }
interface LPay { route_day_plan_id: string; shop_id: string; amount_paise: number; payment_mode: 'cash' | 'upi'; created_at: string }

/** Everything delivered on a day, refreshed the moment a driver's bill or payment reaches the server. */
function useLive(date: string) {
  return useQuery({
    queryKey: ['live', date],
    refetchInterval: 20_000,
    queryFn: async () => {
      const plans = await must<LPlan[]>(supabase.from('route_day_plan').select('id, date, status, route(name), vehicle(name)').eq('date', date).neq('status', 'planning'))
      const ids = plans.map((p) => p.id)
      if (!ids.length) return { plans, orders: [] as LOrder[], invoices: [] as LInvoice[], pays: [] as LPay[] }
      const [orders, invoices, pays] = await Promise.all([
        must<LOrder[]>(supabase.from('orders').select('id, status, shop_id, route_day_plan_id, shop(name, stop_seq), order_line(qty_ordered, unit_price_paise)').in('route_day_plan_id', ids)),
        must<LInvoice[]>(supabase.from('invoice').select('id, number, shop_id, route_day_plan_id, total_paise, created_at, shop(name), delivery_line(qty_delivered)').in('route_day_plan_id', ids).order('created_at', { ascending: false })),
        must<LPay[]>(supabase.from('ledger_entry').select('route_day_plan_id, shop_id, amount_paise, payment_mode, created_at').eq('type', 'payment').in('route_day_plan_id', ids)),
      ])
      return { plans, orders, invoices, pays }
    },
  })
}

export default function LivePage() {
  const { t, i18n } = useTranslation()
  const fmt = useLocaleDate()
  const qc = useQueryClient()
  const [date, setDate] = useState(todayIST())
  const live = useLive(date)
  const [stamp, setStamp] = useState(() => Date.now())

  // Realtime: any new bill, payment or trip change refreshes the page.
  useEffect(() => {
    const ch = supabase.channel('live-deliveries')
    for (const table of ['invoice', 'ledger_entry', 'route_day_plan']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => { void qc.invalidateQueries({ queryKey: ['live'] }); setStamp(Date.now()) })
    }
    ch.subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [qc])

  const d = live.data
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'
  const time = (iso: string) => new Date(iso).toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' })
  const trips = useMemo(() => (d?.plans ?? []).map((p) => {
    const os = d!.orders.filter((o) => o.route_day_plan_id === p.id && o.status !== 'cancelled')
    const inv = d!.invoices.filter((i) => i.route_day_plan_id === p.id)
    const pays = d!.pays.filter((x) => x.route_day_plan_id === p.id)
    const doneShops = new Set(inv.map((i) => i.shop_id))
    const paid = (m: string) => pays.filter((x) => x.payment_mode === m).reduce((a, x) => a - x.amount_paise, 0)
    return {
      p, stops: new Set([...os.map((o) => o.shop_id), ...doneShops]).size, done: doneShops.size,
      cases: inv.reduce((a, i) => a + i.delivery_line.reduce((s, l) => s + l.qty_delivered, 0), 0),
      ordered: os.reduce((a, o) => a + o.order_line.reduce((s, l) => s + l.qty_ordered, 0), 0),
      value: inv.reduce((a, i) => a + i.total_paise, 0), cash: paid('cash'), upi: paid('upi'),
      pending: os.filter((o) => !doneShops.has(o.shop_id)).sort((a, b) => a.shop.stop_seq - b.shop.stop_seq),
      last: inv[0]?.created_at,
    }
  }), [d])
  const all = trips.reduce((a, x) => ({ done: a.done + x.done, stops: a.stops + x.stops, value: a.value + x.value, cash: a.cash + x.cash, upi: a.upi + x.upi, cases: a.cases + x.cases }),
    { done: 0, stops: 0, value: 0, cash: 0, upi: 0, cases: 0 })
  const vehicleOf = new Map((d?.plans ?? []).map((p) => [p.id, p.vehicle?.name ?? p.route.name]))
  const paidFor = (i: LInvoice) => -(d?.pays ?? []).filter((x) => x.shop_id === i.shop_id && x.route_day_plan_id === i.route_day_plan_id).reduce((a, x) => a + x.amount_paise, 0)

  return (
    <section className="stack-lg">
      <PageHeader title={t('live.title')} sub={<span className="row" style={{ gap: 6 }}><Radio size={14} aria-hidden="true" style={{ color: 'var(--success, #16a34a)' }} />{t('live.updated', { time: time(new Date(Math.max(stamp, live.dataUpdatedAt || 0)).toISOString()) })}</span>}
        actions={<input type="date" aria-label={t('orders.deliveryDay')} value={date} onChange={(e) => setDate(e.target.value || todayIST())} />} />
      {live.isLoading ? <Skeleton rows={5} /> : !trips.length ? (
        <div className="card"><Empty icon={<Truck size={26} />} title={t('live.none', { date: fmt(date, true) })}><p>{t('live.noneHint')}</p></Empty></div>
      ) : <>
        <div className="stats">
          <div className="stat kpi kpi-green"><span className="kpi-icon" aria-hidden="true"><CircleCheck size={18} /></span><div className="label">{t('live.delivered')}</div><div className="value num">{all.done} / {all.stops}</div><div className="cell-sub">{t('live.cases', { n: all.cases })}</div></div>
          <div className="stat kpi kpi-violet"><span className="kpi-icon" aria-hidden="true"><Package size={18} /></span><div className="label">{t('live.billed')}</div><div className="value num">{formatPaise(all.value)}</div></div>
          <div className="stat kpi kpi-green"><span className="kpi-icon" aria-hidden="true"><Banknote size={18} /></span><div className="label">{t('driver.cash')}</div><div className="value num">{formatPaise(all.cash)}</div></div>
          <div className="stat kpi kpi-blue"><span className="kpi-icon" aria-hidden="true"><Smartphone size={18} /></span><div className="label">UPI</div><div className="value num">{formatPaise(all.upi)}</div></div>
        </div>

        <div className="dash-grid">
          {trips.map((x) => (
            <div key={x.p.id} className="card stack">
              <div className="row-between"><div className="row"><span className="icon-tile sm"><Truck size={18} aria-hidden="true" /></span>
                <div><strong>{x.p.vehicle?.name ?? '—'}</strong><div className="cell-sub">{x.p.route.name}</div></div></div>
                <span className={`badge ${x.p.status === 'closed' ? '' : x.p.status === 'out' ? 'badge-green' : 'badge-amber'}`}>{t(`loading.status.${x.p.status}`)}</span></div>
              <div className="meter"><div className="row-between cell-sub"><span>{t('live.stopsDone')}</span><span className="num">{x.done} / {x.stops}</span></div>
                <div className="bar" role="progressbar" aria-label={t('live.stopsDone')} aria-valuenow={x.done} aria-valuemin={0} aria-valuemax={x.stops}><i style={{ width: `${x.stops ? (x.done / x.stops) * 100 : 0}%` }} /></div></div>
              <div className="cell-sub num">{t('live.tripLine', { cases: x.cases, ordered: x.ordered, value: formatPaise(x.value), cash: formatPaise(x.cash), upi: formatPaise(x.upi) })}</div>
              {x.last && <div className="cell-sub"><Clock size={12} aria-hidden="true" /> {t('live.lastAt', { time: time(x.last) })}</div>}
              {x.pending.length > 0 && <details><summary className="cell-sub">{t('live.pending', { n: x.pending.length })}</summary>
                <ul className="plain-list cell-sub">{x.pending.map((o) => <li key={o.id}>#{o.shop.stop_seq} {o.shop.name}</li>)}</ul></details>}
            </div>))}
        </div>

        <div className="stack">
          <h2>{t('live.feed')}</h2>
          {!d?.invoices.length ? <p className="muted">{t('live.noBills')}</p> : (
            <div className="table-wrap"><table className="table-stack">
              <thead><tr><th scope="col">{t('audit.when')}</th><th scope="col">{t('shops.name')}</th><th scope="col">{t('loading.vehicle')}</th><th scope="col">{t('orders.cases')}</th><th scope="col">{t('live.bill')}</th><th scope="col">{t('driver.paid')}</th></tr></thead>
              <tbody>{d.invoices.slice(0, 100).map((i) => (
                <tr key={i.id}>
                  <td className="lead num nowrap">{time(i.created_at)}</td>
                  <td data-label={t('shops.name')}><div className="cell-title">{i.shop.name}</div><div className="cell-sub">{i.number}</div></td>
                  <td data-label={t('loading.vehicle')}>{vehicleOf.get(i.route_day_plan_id)}</td>
                  <td data-label={t('orders.cases')} className="num">{i.delivery_line.reduce((s, l) => s + l.qty_delivered, 0)}</td>
                  <td data-label={t('live.bill')} className="num"><strong>{formatPaise(i.total_paise)}</strong></td>
                  <td data-label={t('driver.paid')} className="num">{paidFor(i) > 0 ? formatPaise(paidFor(i)) : <span className="badge badge-amber">{t('live.credit')}</span>}</td>
                </tr>))}</tbody>
            </table></div>
          )}
        </div>
      </>}
    </section>
  )
}
