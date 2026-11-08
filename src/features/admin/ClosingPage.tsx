import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CircleCheck, ClipboardCheck, LockOpen, TriangleAlert } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must, usePacks, useVariants } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise, rupeesToPaise } from '../../shared/money'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Skeleton, type Msg } from '../../shared/ui/kit'
import { useConfirm } from '../../shared/ui/confirm'
import { addDays, todayIST, useLocaleDate } from './opsData'
import { Link } from 'react-router'
import { useMoneyHoldings, useMoneyPayments } from './money'

interface Handover {
  route_day_plan_id: string; expected_cash_paise: number; expected_upi_paise: number; handed_cash_paise: number
  stock_diff: { variant_id: string; expected: number; returned: number }[]; note: string | null; closed_at: string
  received_paise: number | null; received_at: string | null
}
interface PlanRow { id: string; date: string; status: string; route: { name: string }; driver_id: string | null; cash_handover: Handover | null }

// eslint-disable-next-line react-refresh/only-export-components
export const useClosings = () => useQuery({
  queryKey: ['closings'],
  queryFn: () => must<PlanRow[]>(supabase.from('route_day_plan').select('id, date, status, driver_id, route(name), cash_handover(*)')
    .gte('date', addDays(todayIST(), -7)).lte('date', todayIST()).in('status', ['loaded', 'out', 'closed']).order('date', { ascending: false })),
})

/** A day needs attention until cash is confirmed, or if counts/cash did not match. */
// eslint-disable-next-line react-refresh/only-export-components
export const needsAttention = (p: PlanRow) => p.status !== 'closed' || !p.cash_handover?.received_at
  || p.cash_handover.handed_cash_paise !== p.cash_handover.expected_cash_paise || p.cash_handover.stock_diff.length > 0
  || p.cash_handover.received_paise !== p.cash_handover.handed_cash_paise

export default function ClosingPage() {
  const { t } = useTranslation()
  const fmt = useLocaleDate()
  const days = useClosings()
  const drivers = useQuery({
    queryKey: ['profiles', 'drivers-all'],
    queryFn: () => must<{ user_id: string; name: string }[]>(supabase.from('profiles').select('user_id, name').eq('role', 'driver')),
  })
  const name = new Map(drivers.data?.map((d) => [d.user_id, d.name]))
  return (
    <section className="stack-lg">
      <PageHeader title={t('eod.adminTitle')} sub={t('eod.adminSub')} />
      <CounterDay />
      {days.isLoading ? <Skeleton rows={3} /> : !days.data?.length ? (
        <div className="card"><Empty icon={<ClipboardCheck size={26} />} title={t('eod.noDays')} /></div>
      ) : (
        <div className="stack">{days.data.map((p) => <DayCard key={p.id} plan={p} driver={name.get(p.driver_id ?? '') ?? '—'} dateLabel={fmt(p.date)} />)}</div>
      )}
    </section>
  )
}

function DayCard({ plan, driver, dateLabel }: { plan: PlanRow; driver: string; dateLabel: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const packs = usePacks(); const variants = useVariants()
  const h = plan.cash_handover
  const [received, setReceived] = useState(h ? String(h.handed_cash_paise / 100) : '')
  const [msg, setMsg] = useState<Msg>(null)
  const hi = i18n.language === 'hi'
  const label = (id: string) => {
    const v = variants.data?.find((x) => x.id === id); const p = packs.data?.find((x) => x.id === v?.pack_id)
    if (!v || !p) return '?'
    const pn = (hi && p.name_hi) || p.name_en
    return v.flavour_en === p.name_en ? pn : `${(hi && v.flavour_hi) || v.flavour_en} · ${pn}`
  }
  const refresh = () => void qc.invalidateQueries({ queryKey: ['closings'] })
  const confirmCash = async () => {
    const { error } = await supabase.rpc('confirm_handover', { p_plan_id: plan.id, p_received_paise: rupeesToPaise(Number(received) || 0) })
    if (error) setMsg({ kind: 'error', text: errorMessage(t, error) }); else { setMsg({ kind: 'success', text: t('eod.confirmed') }); refresh() }
  }
  const reopen = async () => {
    if (!(await confirm({ title: t('eod.reopen'), body: t('eod.reopenHint'), confirm: t('eod.reopen'), danger: true }))) return
    const { error } = await supabase.rpc('reopen_day', { p_plan_id: plan.id })
    if (error) setMsg({ kind: 'error', text: errorMessage(t, error) }); else refresh()
  }
  const cashDiff = h ? h.handed_cash_paise - h.expected_cash_paise : 0
  const flagged = !!h && (cashDiff !== 0 || h.stock_diff.length > 0)

  return (
    <article className="card stack">
      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <div><h2>{plan.route.name} · {dateLabel}</h2><p className="muted">{t('loading.driver')}: {driver}</p></div>
        {!h ? <span className="badge badge-blue">{t(`loading.status.${plan.status}`)}</span>
          : h.received_at ? <span className="badge badge-green"><CircleCheck size={12} aria-hidden="true" />{t('eod.cashIn')}</span>
          : <span className="badge badge-amber">{t('eod.awaitingCash')}</span>}
      </div>
      {!h ? <p className="muted">{t('eod.notClosed')}</p> : (
        <>
          <div className="stats">
            <div className="stat"><div className="label">{t('eod.expectedCash')}</div><div className="value num">{formatPaise(h.expected_cash_paise)}</div></div>
            <div className="stat"><div className="label">{t('eod.handed')}</div><div className={`value num ${cashDiff ? 'text-warn' : ''}`}>{formatPaise(h.handed_cash_paise)}</div></div>
            <div className="stat"><div className="label">UPI</div><div className="value num">{formatPaise(h.expected_upi_paise)}</div></div>
            <div className="stat"><div className="label">{t('eod.received')}</div><div className="value num">{h.received_paise === null ? '—' : formatPaise(h.received_paise)}</div></div>
          </div>
          {flagged && (
            <div className="alert alert-warn" style={{ flexDirection: 'column' }}>
              <strong className="row"><TriangleAlert size={16} aria-hidden="true" />{t('eod.differences')}</strong>
              {cashDiff !== 0 && <span>{t(cashDiff < 0 ? 'eod.cashShort' : 'eod.cashOver', { amount: formatPaise(Math.abs(cashDiff)) })}</span>}
              {h.stock_diff.map((d) => <span key={d.variant_id}>{t('eod.stockLine', { item: label(d.variant_id), expected: d.expected, returned: d.returned })}</span>)}
            </div>
          )}
          {h.note && <p className="muted">“{h.note}”</p>}
          <Alert msg={msg} />
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {!h.received_at && <>
              <label className="field grow" style={{ maxWidth: 240 }}><span>{t('eod.cashCounted')}</span>
                <input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ''))} /></label>
              <button type="button" className="primary" onClick={() => void confirmCash()}><CircleCheck size={18} aria-hidden="true" />{t('eod.confirmCash')}</button>
            </>}
            {profile?.role === 'admin' && <button type="button" className="danger" onClick={() => void reopen()}><LockOpen size={18} aria-hidden="true" />{t('eod.reopen')}</button>}
          </div>
        </>
      )}
    </article>
  )
}

/** Counter + truck bills of today: what came in, where the money sits, and what is still with partners. */
function CounterDay() {
  const { t } = useTranslation()
  const today = todayIST()
  const pays = useMoneyPayments(today, today)
  const hold = useMoneyHoldings()
  const bills = (pays.data ?? []).filter((p) => p.kind === 'counter_sale')
  if (pays.isLoading) return <Skeleton rows={1} />
  const sum = (f: (p: (typeof bills)[number]) => boolean) => bills.filter(f).reduce((a, p) => a + p.amount_paise, 0)
  const byAcc = new Map<string, number>()
  for (const b of bills) byAcc.set(b.account ?? (b.mode === 'cash' ? t('eod.counterCashBox') : t('eod.counterBank')), (byAcc.get(b.account ?? (b.mode === 'cash' ? t('eod.counterCashBox') : t('eod.counterBank'))) ?? 0) + b.amount_paise)
  const held = (hold.data ?? []).filter((h) => h.kind !== 'company' && h.holding_paise > 0)
  return (
    <div className="card stack" data-testid="counter-day">
      <div className="row-between"><h2>{t('eod.counterTitle')}</h2><Link to="/admin/sales" className="button btn-sm">{t('nav.sales')}</Link></div>
      {!bills.length ? <p className="muted">{t('eod.counterNone')}</p> : <>
        <div className="stats">
          <div className="stat"><div className="label">{t('eod.counterBills')}</div><div className="value num">{bills.length}</div></div>
          <div className="stat"><div className="label">{t('eod.counterTotal')}</div><div className="value num">{formatPaise(sum(() => true))}</div></div>
          <div className="stat"><div className="label">{t('driver.cash')}</div><div className="value num">{formatPaise(sum((p) => p.mode === 'cash'))}</div></div>
          <div className="stat"><div className="label">UPI</div><div className="value num">{formatPaise(sum((p) => p.mode === 'upi'))}</div></div>
        </div>
        <ul className="plain-list cell-sub">{[...byAcc.entries()].map(([k, v]) => <li key={k}>{t('eod.counterInto', { acc: k, v: formatPaise(v) })}</li>)}</ul>
      </>}
      {held.length > 0 && <Alert msg={{ kind: 'warn', text: t('eod.counterHeld', { list: held.map((h) => `${h.name} ${formatPaise(h.holding_paise)}`).join(', ') }) }} />}
      {held.length > 0 && <Link to="/admin/money" className="button btn-sm" style={{ alignSelf: 'flex-start' }}>{t('nav.money')}</Link>}
    </div>
  )
}