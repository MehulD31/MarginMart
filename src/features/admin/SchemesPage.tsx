import { useMemo, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Gift } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must, usePacks, useVariants } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise, rupeesToPaise } from '../../shared/money'
import type { Scheme } from '../../shared/margin'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Skeleton, type Msg } from '../../shared/ui/kit'
import { useConfirm } from '../../shared/ui/confirm'
import { addDays, todayIST, useLocaleDate } from './opsData'
import { useSchemes } from './marginData'

/** Time-limited schemes: they change staff order prices only between their dates. Shops never see them. */
export default function SchemesPage() {
  const { t, i18n } = useTranslation()
  const fmt = useLocaleDate()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const isAdmin = useAuth().profile?.role === 'admin'
  const list = useSchemes(true)
  const packs = usePacks(); const variants = useVariants()
  const hi = i18n.language === 'hi'
  const packName = useMemo(() => new Map(packs.data?.map((p) => [p.id, (hi && p.name_hi) || p.name_en])), [packs.data, hi])
  const flavourName = useMemo(() => new Map(variants.data?.map((v) => [v.id, (hi && v.flavour_hi) || v.flavour_en])), [variants.data, hi])
  const today = todayIST()
  const state = (s: Scheme) => !s.active ? 'ended' : s.ends_on < today ? 'over' : s.starts_on > today ? 'upcoming' : 'running'

  const end = async (s: Scheme) => {
    if (!(await confirm({ title: t('schemes.endNow'), body: t('schemes.endBody', { name: packName.get(s.pack_id) }), confirm: t('schemes.endNow'), danger: true }))) return
    await must(supabase.from('scheme').update({ active: false }).eq('id', s.id).select())
    void qc.invalidateQueries({ queryKey: ['scheme'] })
  }

  return (
    <section className="stack-lg">
      <PageHeader title={t('schemes.title')} sub={t('schemes.sub')} />
      {isAdmin && <NewScheme />}
      {list.isLoading ? <Skeleton rows={4} /> : !list.data?.length ? (
        <div className="card"><Empty icon={<Gift size={26} />} title={t('schemes.empty')} /></div>
      ) : (
        <div className="table-wrap"><table className="table-stack">
          <thead><tr><th scope="col">{t('inventory.item')}</th><th scope="col">{t('schemes.amount')}</th><th scope="col">{t('schemes.dates')}</th><th scope="col">{t('users.status')}</th><th scope="col"><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
          <tbody>{list.data.map((s) => {
            const st = state(s)
            return (
              <tr key={s.id} className={st === 'running' || st === 'upcoming' ? '' : 'dim'}>
                <td className="lead"><div className="cell-title">{packName.get(s.pack_id)}</div>
                  <div className="cell-sub">{s.variant_ids?.length ? s.variant_ids.map((v) => flavourName.get(v)).join(', ') : t('schemes.allFlavours')}{s.note ? ` · ${s.note}` : ''}</div></td>
                <td data-label={t('schemes.amount')} className="num"><strong>{formatPaise(s.amount_paise)}</strong>
                  <div className="cell-sub">{t(`schemes.kind.${s.kind}`)}</div></td>
                <td data-label={t('schemes.dates')} className="nowrap">{fmt(s.starts_on)} – {fmt(s.ends_on)}</td>
                <td data-label={t('users.status')}><span className={`badge ${st === 'running' ? 'badge-green' : st === 'upcoming' ? 'badge-blue' : ''}`}>{t(`schemes.state.${st}`)}</span></td>
                <td className="actions">{isAdmin && (st === 'running' || st === 'upcoming') && <button type="button" className="btn-sm danger" onClick={() => void end(s)}>{t('schemes.endNow')}</button>}</td>
              </tr>)
          })}</tbody>
        </table></div>
      )}
    </section>
  )
}

function NewScheme() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const packs = usePacks(); const variants = useVariants()
  const hi = i18n.language === 'hi'
  const [pack, setPack] = useState('')
  const [only, setOnly] = useState<string[]>([])
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<Scheme['kind']>('pass_through')
  const [from, setFrom] = useState(todayIST())
  const [to, setTo] = useState(addDays(todayIST(), 3))
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const flavours = (variants.data ?? []).filter((v) => v.pack_id === pack && v.active)
  const sorted = [...(packs.data ?? [])].filter((p) => p.active).sort((a, b) => a.name_en.localeCompare(b.name_en))
  const valid = pack && Number(amount) > 0 && from && to && to >= from

  const save = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null)
    try {
      await must(supabase.from('scheme').insert({ pack_id: pack, variant_ids: only.length ? only : null, kind, amount_paise: rupeesToPaise(Number(amount)),
        starts_on: from, ends_on: to, note: note.trim() || null }).select())
      setPack(''); setOnly([]); setAmount(''); setNote('')
      setMsg({ kind: 'success', text: t('common.saved') })
      void qc.invalidateQueries({ queryKey: ['scheme'] })
    } catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) }
  }

  return (
    <form className="card stack" onSubmit={save} noValidate>
      <h2>{t('schemes.new')}</h2>
      <div className="form-grid">
        <label className="field"><span>{t('inventory.item')}</span>
          <select value={pack} onChange={(e) => { setPack(e.target.value); setOnly([]) }}>
            <option value="">{t('loading.choose')}</option>
            {sorted.map((p) => <option key={p.id} value={p.id}>{(hi && p.name_hi) || p.name_en}</option>)}
          </select></label>
        <label className="field"><span>{t('schemes.amountRs')}</span><input type="number" inputMode="decimal" min={0} step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="field"><span>{t('schemes.from')}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>{t('schemes.to')}</span><input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {flavours.length > 1 && (
        <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label={t('schemes.flavours')}>
          <span className="muted">{t('schemes.flavoursHint')}</span>
          {flavours.map((v) => (
            <label key={v.id} className="chip"><input type="checkbox" checked={only.includes(v.id)}
              onChange={(e) => setOnly(e.target.checked ? [...only, v.id] : only.filter((x) => x !== v.id))} />{(hi && v.flavour_hi) || v.flavour_en}</label>))}
        </div>
      )}
      <div className="row" style={{ flexWrap: 'wrap' }} role="radiogroup" aria-label={t('schemes.who')}>
        {(['pass_through', 'our_discount'] as const).map((k) => (
          <label key={k} className="chip"><input type="radio" name="scheme-kind" checked={kind === k} onChange={() => setKind(k)} />{t(`schemes.kind.${k}`)}</label>))}
      </div>
      <label className="field"><span>{t('purchases.note')}</span><input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('schemes.notePh')} /></label>
      <Alert msg={msg} />
      <div className="row"><button type="submit" className="primary" disabled={!valid}>{t('schemes.save')}</button></div>
    </form>
  )
}
