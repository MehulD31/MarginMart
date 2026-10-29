import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise, rupeesToPaise } from '../../shared/money'
import { capacityCases, fixedTotal, slabOff, type BusinessSettings, type Slab } from '../../shared/margin'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, PageHeader, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'
import { useMargin } from './marginData'

const rs = (p: number) => formatPaise(p)

export default function PricingPage() {
  const { t, i18n } = useTranslation()
  const isAdmin = useAuth().profile?.role === 'admin'
  const m = useMargin()
  const [edit, setEdit] = useState(false)
  if (!m) return <Skeleton rows={6} />
  const { s, cost, volume, onSeason } = m
  const hi = i18n.language === 'hi'
  const slabs = onSeason ? s.slabs.on : s.slabs.off
  const steps = [1, ...slabs.map((x) => x.min)]
  const rows = m.packs.filter((p) => p.active && m.byPack.has(p.id)).map((p) => ({ p, x: m.byPack.get(p.id)!, list: m.prices.find((i) => i.pack_id === p.id)! }))
  const cap = capacityCases(s, m.trucks)

  return (
    <section className="stack-lg">
      <PageHeader title={t('pricing.title')} sub={t('pricing.sub')}
        actions={isAdmin && <button type="button" onClick={() => setEdit(true)}>{t('pricing.settings')}</button>} />

      <div className="stats">
        <div className="stat"><div className="label">{t('pricing.season')}</div><div className="value">{onSeason ? t('pricing.on') : t('pricing.off')}</div></div>
        <div className="stat"><div className="label">{t('pricing.fixed')}</div><div className="value num">{rs(fixedTotal(s))}</div><div className="cell-sub">{t('pricing.perMonth')}</div></div>
        <div className="stat"><div className="label">{t('pricing.volume')}</div><div className="value num">{volume.cases.toLocaleString('en-IN')}</div>
          <div className="cell-sub">{volume.projected ? t('pricing.projected', { n: m.stats.cases }) : t('pricing.planned')} · {t('pricing.capacity', { n: cap.toLocaleString('en-IN') })}</div></div>
        <div className="stat"><div className="label">{t('pricing.costPerCase')}</div><div className="value num">{rs(cost.total)}</div>
          <div className="cell-sub">{t('pricing.costSplit', { fixed: rs(cost.fixed), variable: rs(cost.variable) })}</div></div>
      </div>
      {volume.cases > cap && cap > 0 && <Alert msg={{ kind: 'warn', text: t('pricing.overCapacity', { n: cap.toLocaleString('en-IN') }) }} />}
      <p className="muted">{t('pricing.how')}</p>

      <div className="table-wrap table-scroll"><table className="dense">
        <thead><tr>
          <th scope="col">{t('inventory.item')}</th><th scope="col">{t('pricing.buy')}</th><th scope="col">{t('pricing.trade')}</th><th scope="col">{t('pricing.margin')}</th>
          {steps.map((n, i) => <th key={n} scope="col">{i === 0 ? t('pricing.slabFirst', { n: (steps[1] ?? 2) - 1 }) : t('pricing.slabFrom', { n })}</th>)}
          <th scope="col">{t('pricing.min')}</th><th scope="col">{t('pricing.floor')}</th>
        </tr></thead>
        <tbody>{rows.map(({ p, x, list }) => {
          const room = x.trade - x.min
          return (
            <tr key={p.id}>
              <th scope="row">{(hi && p.name_hi) || p.name_en}{list.scheme_value_paise > 0 && <div className="cell-sub">{t('pricing.scheme', { v: rs(list.scheme_value_paise) })}</div>}</th>
              <td className="num">{rs(x.buy)}{!x.buyKnown && <span className="muted"> *</span>}</td>
              <td className="num">{rs(x.trade)}</td>
              <td className="num"><span className={`badge ${x.margin < cost.total ? 'badge-red' : room >= 3000 ? 'badge-green' : ''}`}>{rs(x.margin)}</span></td>
              {steps.map((n) => <td key={n} className="num">{rs(Math.max(x.trade - slabOff(s, n, onSeason), x.min))}</td>)}
              <td className="num"><strong>{rs(x.min)}</strong></td>
              <td className="num">{rs(x.floor)}</td>
            </tr>)
        })}</tbody>
      </table></div>
      <p className="muted">{t('pricing.legend', { m: rs(s.default_margin_paise) })}</p>

      <Sheet open={edit} wide title={t('pricing.settings')} onClose={() => setEdit(false)}>
        {edit && <SettingsForm s={s} onDone={() => setEdit(false)} />}
      </Sheet>
    </section>
  )
}

const r = (p: number) => String(p / 100)

function SettingsForm({ s, onDone }: { s: BusinessSettings; onDone: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [costs, setCosts] = useState(s.fixed_costs.map((c) => ({ label: c.label, rs: r(c.paise) })))
  const [f, setF] = useState({
    loading: r(s.loading_paise_per_case), cash: r(s.cash_discount_paise), ontime: String(s.on_time_pct), margin: r(s.default_margin_paise),
    cap: String(s.truck_capacity), trips: String(s.trips_per_day), days: String(s.working_days),
    off: String(s.planned_cases_off), on: String(s.planned_cases_on), months: s.on_season_months.join(','),
  })
  const [slabs, setSlabs] = useState({ off: s.slabs.off.map((x) => ({ min: String(x.min), rs: r(x.off) })), on: s.slabs.on.map((x) => ({ min: String(x.min), rs: r(x.off) })) })
  const [msg, setMsg] = useState<Msg>(null)
  const num = (k: keyof typeof f) => <input type="number" inputMode="decimal" min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  const toSlabs = (xs: { min: string; rs: string }[]): Slab[] => xs.filter((x) => Number(x.min) > 0).map((x) => ({ min: Math.floor(Number(x.min)), off: rupeesToPaise(Number(x.rs) || 0) })).sort((a, b) => a.min - b.min)

  const save = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null)
    try {
      await must(supabase.from('business_settings').update({
        fixed_costs: costs.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), paise: rupeesToPaise(Number(c.rs) || 0) })),
        loading_paise_per_case: rupeesToPaise(Number(f.loading)), cash_discount_paise: rupeesToPaise(Number(f.cash)), on_time_pct: Number(f.ontime),
        default_margin_paise: rupeesToPaise(Number(f.margin)), truck_capacity: Number(f.cap), trips_per_day: Number(f.trips), working_days: Number(f.days),
        planned_cases_off: Number(f.off), planned_cases_on: Number(f.on),
        on_season_months: f.months.split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= 12),
        slabs: { off: toSlabs(slabs.off), on: toSlabs(slabs.on) },
      }).eq('id', 1).select())
      void qc.invalidateQueries({ queryKey: ['business_settings'] })
      onDone()
    } catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) }
  }
  const slabEditor = (k: 'off' | 'on') => (
    <div className="stack">
      <h3>{k === 'on' ? t('pricing.slabsOn') : t('pricing.slabsOff')}</h3>
      {slabs[k].map((x, i) => (
        <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field"><span>{t('pricing.fromCases')}</span><input type="number" min={1} value={x.min} onChange={(e) => setSlabs({ ...slabs, [k]: slabs[k].map((y, j) => (j === i ? { ...y, min: e.target.value } : y)) })} /></label>
          <label className="field"><span>{t('pricing.offPerCase')}</span><input type="number" min={0} step="0.5" value={x.rs} onChange={(e) => setSlabs({ ...slabs, [k]: slabs[k].map((y, j) => (j === i ? { ...y, rs: e.target.value } : y)) })} /></label>
          <button type="button" className="ghost icon-btn" aria-label={t('purchases.removeLine')} onClick={() => setSlabs({ ...slabs, [k]: slabs[k].filter((_, j) => j !== i) })}><Trash2 size={18} /></button>
        </div>))}
      <div className="row"><button type="button" className="btn-sm" onClick={() => setSlabs({ ...slabs, [k]: [...slabs[k], { min: '', rs: '' }] })}><Plus size={16} aria-hidden="true" />{t('pricing.addSlab')}</button></div>
    </div>)

  return (
    <form className="stack-lg" onSubmit={save} noValidate>
      <div className="stack">
        <h3>{t('pricing.fixed')}</h3>
        {costs.map((c, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field grow"><span>{t('pricing.costName')}</span><input value={c.label} onChange={(e) => setCosts(costs.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} /></label>
            <label className="field" style={{ width: 140 }}><span>{t('pricing.perMonthRs')}</span><input type="number" min={0} value={c.rs} onChange={(e) => setCosts(costs.map((y, j) => (j === i ? { ...y, rs: e.target.value } : y)))} /></label>
            <button type="button" className="ghost icon-btn" aria-label={t('purchases.removeLine')} onClick={() => setCosts(costs.filter((_, j) => j !== i))}><Trash2 size={18} /></button>
          </div>))}
        <div className="row"><button type="button" className="btn-sm" onClick={() => setCosts([...costs, { label: '', rs: '' }])}><Plus size={16} aria-hidden="true" />{t('pricing.addCost')}</button></div>
      </div>
      <div className="form-grid">
        <label className="field"><span>{t('pricing.loadingRs')}</span>{num('loading')}</label>
        <label className="field"><span>{t('pricing.cashRs')}</span>{num('cash')}</label>
        <label className="field"><span>{t('pricing.onTimePct')}</span>{num('ontime')}</label>
        <label className="field"><span>{t('pricing.defaultMargin')}</span>{num('margin')}</label>
        <label className="field"><span>{t('pricing.truckCap')}</span>{num('cap')}</label>
        <label className="field"><span>{t('pricing.trips')}</span>{num('trips')}</label>
        <label className="field"><span>{t('pricing.days')}</span>{num('days')}</label>
        <label className="field"><span>{t('pricing.months')}</span><input value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} /></label>
        <label className="field"><span>{t('pricing.plannedOff')}</span>{num('off')}</label>
        <label className="field"><span>{t('pricing.plannedOn')}</span>{num('on')}</label>
      </div>
      {slabEditor('off')}
      {slabEditor('on')}
      <Alert msg={msg} />
      <div className="row"><button type="submit" className="primary">{t('common.save')}</button></div>
    </form>
  )
}
