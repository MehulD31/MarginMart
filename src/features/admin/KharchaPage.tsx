import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Wallet } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { formatPaise, rupeesToPaise } from '../../shared/money'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Skeleton, type Msg } from '../../shared/ui/kit'
import { Pager } from '../../shared/ui/Pager'
import { usePaged } from '../../shared/ui/paging'
import { useConfirm } from '../../shared/ui/confirm'
import { CATEGORIES, fixedPerDay, pnl, spendBudget, type KharchaSettings } from '../../shared/kharcha.js'
import { todayIST } from './opsData'
import { useDraft } from '../../shared/ui/draft'
import { DraftNote } from '../../shared/ui/DraftNote'
import { monthStart, r100, useExpenses, useKharchaSettings, usePnl, type Expense } from './kharchaData'

/** "How was today?" — the card on the dashboard and on top of this page. */
export function DayPnlCard({ link = false }: { link?: boolean }) {
  const { t } = useTranslation()
  const today = todayIST()
  const s = useKharchaSettings(), day = usePnl(today, today), month = usePnl(monthStart(today), today)
  const spendsToday = useExpenses(today, today), spendsMonth = useExpenses(monthStart(today), today)
  if (!s.data || !day.data || !month.data || !spendsToday.data || !spendsMonth.data) return <Skeleton rows={4} />
  const d = pnl(day.data, spendsToday.data, s.data, day.data.cases > 0 || spendsToday.data.length ? 1 : 0)
  const m = pnl(month.data, spendsMonth.data, s.data, Number(month.data.active_days) || 0)
  const cats = Object.entries(d.byCat).map(([c, p]) => `${t(`kharcha.cat.${c}`, { defaultValue: c })} ${r100(p)}`).join(', ')
  const row = (label: string, v: number, sub?: string, strong = false) => (
    <div className={`row-between${strong ? ' total-row' : ''}`}><span>{label}{sub && <span className="cell-sub"> ({sub})</span>}</span>
      <strong className={`num${strong ? (v >= 0 ? ' text-ok' : ' text-warn') : ''}`}>{r100(v)}</strong></div>)
  return (
    <div className="card stack" style={{ gap: 6 }} data-testid="day-pnl">
      <div className="row-between"><h2 style={{ margin: 0 }}>{t('kharcha.today')}</h2>
        {link && <Link to="/admin/kharcha" className="button btn-sm"><Plus size={16} aria-hidden="true" />{t('kharcha.add')}</Link>}</div>
      {row(t('kharcha.sales'), d.sales, t('kharcha.cases', { n: d.cases }))}
      {row(`− ${t('kharcha.goods')}`, d.cost)}
      {row(`− ${t('kharcha.loading')}`, d.variable)}
      {row(`− ${t('kharcha.spent')}`, d.kharcha, cats || t('kharcha.noneYet'))}
      {row(`− ${t('kharcha.fixedShare')}`, d.fixed, t('kharcha.fixedSub'))}
      {row(t('kharcha.profit'), d.profit, undefined, true)}
      {d.need > 0 && <p className="cell-sub">{t('kharcha.need', { n: d.need })}</p>}
      <p className="cell-sub" style={{ marginTop: 6 }}>{t('kharcha.month', { p: r100(m.profit), d: Number(month.data.active_days) || 0, s: r100(m.sales), k: r100(m.kharcha) })}</p>
    </div>
  )
}

export default function KharchaPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const today = todayIST()
  const s = useKharchaSettings()
  const month = useExpenses(monthStart(today), today)
  const [msg, setMsg] = useState<Msg>(null)
  // amount, category, note and "paid from" are kept until the kharcha is saved (a phone call or refresh loses nothing); the date is
  // always today unless you pick another day, so an old draft never saves on a past date by itself.
  const freshF = () => ({ amount: '', category: CATEGORIES[0] as string, note: '', paid_from: 'cash' })
  const draft = useDraft('kharcha-new', freshF)
  const [spentOn, setSpentOn] = useState(today)
  const f = { ...draft.value, spent_on: spentOn }
  const setF = (v: typeof f) => { const { spent_on, ...rest } = v; setSpentOn(spent_on); draft.set(rest) }
  const pg = usePaged(month.data ?? [], 20)
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['expense'] }); void qc.invalidateQueries({ queryKey: ['business_settings'] }) }

  const add = useMutation({
    mutationFn: async () => {
      const amount_paise = rupeesToPaise(Number(f.amount) || 0)
      if (amount_paise <= 0) throw new Error(t('kharcha.badAmount'))
      await must(supabase.from('expense').insert({ amount_paise, category: f.category, note: f.note.trim() || null, spent_on: f.spent_on, paid_from: f.paid_from, budget_line: s.data?.spend_line ?? 'Miscellaneous' }))
    },
    onSuccess: () => { setMsg({ kind: 'success', text: t('kharcha.added', { v: f.amount, c: t(`kharcha.cat.${f.category}`) }) }); draft.discard({ ...freshF(), category: f.category, paid_from: f.paid_from }); refresh() },
    onError: (e) => setMsg({ kind: 'error', text: errorMessage(t, e) }),
  })
  const voidIt = async (e: Expense) => {
    if (!(await confirm({ title: t('kharcha.voidTitle'), body: t('kharcha.voidBody', { v: formatPaise(e.amount_paise), c: t(`kharcha.cat.${e.category}`, { defaultValue: e.category }) }), confirm: t('kharcha.void'), danger: true }))) return
    try { await must(supabase.from('expense').update({ voided_at: new Date().toISOString() }).eq('id', e.id)); refresh() } catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) }
  }
  const b = s.data && month.data ? spendBudget(s.data, month.data) : null

  return (
    <section className="stack-lg">
      <PageHeader title={t('kharcha.title')} sub={t('kharcha.sub')} />
      <DayPnlCard />

      <form className="card stack" onSubmit={(e) => { e.preventDefault(); add.mutate() }} data-testid="add-kharcha">
        <h2 style={{ margin: 0 }}>{t('kharcha.add')}</h2>
        <DraftNote show={draft.restored} onFresh={() => draft.discard(freshF())} />
        <div className="form-grid-2">
          <label className="field"><span>{t('kharcha.amount')}</span>
            <input inputMode="decimal" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder="800" /></label>
          <label className="field"><span>{t('kharcha.category')}</span>
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`kharcha.cat.${c}`)}</option>)}</select></label>
          <label className="field"><span>{t('kharcha.date')}</span>
            <input type="date" value={f.spent_on} max={today} onChange={(e) => setF({ ...f, spent_on: e.target.value || today })} /></label>
          <label className="field"><span>{t('kharcha.paidFrom')}</span>
            <select value={f.paid_from} onChange={(e) => setF({ ...f, paid_from: e.target.value })}>{['cash', 'upi', 'bank', 'partner'].map((p) => <option key={p} value={p}>{t(`kharcha.from.${p}`)}</option>)}</select></label>
          <label className="field span-2"><span>{t('kharcha.note')}</span>
            <input value={f.note} maxLength={120} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={t('kharcha.notePh')} /></label>
        </div>
        <button type="submit" className="primary" style={{ alignSelf: 'flex-start' }} disabled={add.isPending}><Plus size={18} aria-hidden="true" />{add.isPending ? t('common.loading') : t('kharcha.save')}</button>
        <p className="cell-sub">{t('kharcha.botHint')}</p>
        <Alert msg={msg} />
      </form>

      {b && <div className={`card stack${b.over ? ' trip-short' : ''}`} style={{ gap: 6 }}>
        <h2 style={{ margin: 0 }}>{t('kharcha.budgetTitle', { line: b.line })}</h2>
        <div className="row-between"><span>{t('kharcha.budget')}</span><strong className="num">{r100(b.budget)}</strong></div>
        <div className="row-between"><span>{t('kharcha.spentMonth')}</span><strong className="num">{r100(b.spent)}</strong></div>
        <div className="row-between total-row"><span>{b.over ? t('kharcha.over') : t('kharcha.left')}</span><strong className={`num ${b.over ? 'text-warn' : 'text-ok'}`}>{r100(Math.abs(b.left))}</strong></div>
        <div className="bar"><i style={{ width: `${b.budget ? Math.min(100, (b.spent / b.budget) * 100) : 0}%` }} /></div>
      </div>}

      <div className="stack">
        <h2>{t('kharcha.list')}</h2>
        {month.isLoading ? <Skeleton rows={4} /> : !month.data?.length ? <Empty icon={<Wallet size={24} />} title={t('kharcha.none')} /> : (
          <div className="table-wrap"><table className="table-stack"><tbody>{pg.rows.map((e) => (
            <tr key={e.id}><td className="lead"><div className="cell-title">{t(`kharcha.cat.${e.category}`, { defaultValue: e.category })} · <span className="num">{formatPaise(e.amount_paise)}</span></div>
              <div className="cell-sub">{[e.spent_on, e.note, t(`kharcha.from.${e.paid_from}`), e.source === 'telegram' ? 'Telegram' : null].filter(Boolean).join(' · ')}</div></td>
              <td className="actions"><button type="button" className="icon-btn" aria-label={t('kharcha.void')} onClick={() => void voidIt(e)}><Trash2 size={16} aria-hidden="true" /></button></td></tr>))}
          </tbody></table><Pager p={pg} /></div>)}
      </div>

      {s.data && <FixedEditor s={s.data} onSaved={refresh} />}
    </section>
  )
}

/** Monthly fixed kharcha: edit lines, pick which line real spends come out of. */
function FixedEditor({ s, onSaved }: { s: KharchaSettings; onSaved: () => void }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState(() => s.fixed_costs.map((c) => ({ label: c.label, rupees: String(Math.round(c.paise / 100)) })))
  const [line, setLine] = useState(s.spend_line ?? 'Miscellaneous')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const total = rows.reduce((a, r) => a + rupeesToPaise(Number(r.rupees) || 0), 0)
  const perDay = fixedPerDay({ ...s, spend_line: line, fixed_costs: rows.map((r) => ({ label: r.label, paise: rupeesToPaise(Number(r.rupees) || 0) })) })
  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const fixed_costs = rows.filter((r) => r.label.trim()).map((r) => ({ label: r.label.trim(), paise: rupeesToPaise(Number(r.rupees) || 0) }))
      await must(supabase.from('business_settings').update({ fixed_costs, spend_line: line }).eq('id', 1))
      setMsg({ kind: 'success', text: t('kharcha.fixedSaved') }); onSaved()
    } catch (e) { setMsg({ kind: 'error', text: errorMessage(t, e) }) } finally { setBusy(false) }
  }
  return (
    <div className="card stack" data-testid="fixed-kharcha">
      <h2 style={{ margin: 0 }}>{t('kharcha.fixedTitle')}</h2>
      <p className="cell-sub">{t('kharcha.fixedHint')}</p>
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input style={{ flex: '1 1 140px', minWidth: 0, width: 'auto' }} value={r.label} aria-label={t('kharcha.lineName')} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
          <input style={{ flex: '0 1 120px', minWidth: 0, width: 'auto' }} inputMode="numeric" value={r.rupees} aria-label={t('kharcha.amount')} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, rupees: e.target.value.replace(/\D/g, '') } : x))} />
          <button type="button" className="icon-btn" aria-label={t('kharcha.removeLine')} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={16} aria-hidden="true" /></button>
        </div>))}
      <button type="button" className="btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setRows([...rows, { label: '', rupees: '' }])}><Plus size={16} aria-hidden="true" />{t('kharcha.addLine')}</button>
      <label className="field" style={{ maxWidth: 320 }}><span>{t('kharcha.spendLine')}</span>
        <select value={line} onChange={(e) => setLine(e.target.value)}>{rows.filter((r) => r.label.trim()).map((r) => <option key={r.label} value={r.label}>{r.label}</option>)}</select></label>
      <div className="row-between"><span>{t('kharcha.fixedMonth')}</span><strong className="num">{r100(total)}</strong></div>
      <div className="row-between"><span>{t('kharcha.fixedDay', { d: s.working_days })}</span><strong className="num">{r100(perDay)}</strong></div>
      <Alert msg={msg} />
      <button type="button" className="primary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => void save()}>{busy ? t('common.loading') : t('kharcha.saveFixed')}</button>
    </div>
  )
}
