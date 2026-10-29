import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Boxes } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { isLowStock, must } from '../../shared/api/db'
import { useStockRows, type StockRow } from './stockRows'
import { useAuth } from '../../shared/api/auth'
import { formatPaise } from '../../shared/money'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'

interface Move { id: number; qty: number; kind: string; reason: string | null; balance_after: number; at: string }

export default function InventoryPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const { rows, isLoading } = useStockRows()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'low'>('all')
  const [open, setOpen] = useState<string | null>(null)

  const list = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) && (filter === 'all' || isLowStock(r)))
  const low = rows.filter(isLowStock).length
  const value = rows.reduce((a, r) => a + Math.max(r.on_hand, 0) * r.avg_cost_paise, 0)
  const cases = rows.reduce((a, r) => a + Math.max(r.on_hand, 0), 0)
  const current = rows.find((r) => r.variant_id === open)

  return (
    <section className="stack-lg">
      <PageHeader title={t('inventory.title')} sub={t('inventory.sub', { cases, value: formatPaise(value), low })} />
      {!isAdmin && <Alert msg={{ kind: 'warn', text: t('catalog.readOnly') }} />}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input type="search" aria-label={t('common.search')} placeholder={t('catalog.searchLabel')} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
        <label className="chip"><input type="radio" name="inv-filter" checked={filter === 'all'} onChange={() => setFilter('all')} />{t('common.all')}</label>
        <label className="chip"><input type="radio" name="inv-filter" checked={filter === 'low'} onChange={() => setFilter('low')} />{t('inventory.lowOnly', { n: low })}</label>
      </div>
      {isLoading ? <Skeleton rows={6} /> : list.length === 0 ? (
        <div className="card"><Empty icon={<Boxes size={26} />} title={t('common.noMatches')} /></div>
      ) : (
        <div className="table-wrap"><table className="table-stack">
          <thead><tr><th scope="col">{t('inventory.item')}</th><th scope="col">{t('inventory.onHand')}</th><th scope="col">{t('inventory.threshold')}</th><th scope="col">{t('inventory.avgCost')}</th><th scope="col">{t('inventory.value')}</th><th scope="col"><span className="sr-only">{t('common.edit')}</span></th></tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.variant_id} className={r.active ? '' : 'dim'}>
              <td className="lead"><div className="cell-title">{r.name}</div>{r.sub && <div className="cell-sub">{r.sub}</div>}</td>
              <td data-label={t('inventory.onHand')} className="num"><strong>{r.on_hand}</strong>{' '}
                {r.on_hand < 0 ? <span className="badge badge-red">{t('inventory.negative')}</span> : isLowStock(r) && <span className="badge badge-amber">{t('inventory.low')}</span>}</td>
              <td data-label={t('inventory.threshold')} className="num">{r.low_threshold || '—'}</td>
              <td data-label={t('inventory.avgCost')} className="num">{r.avg_cost_paise ? formatPaise(r.avg_cost_paise) : '—'}</td>
              <td data-label={t('inventory.value')} className="num">{formatPaise(Math.max(r.on_hand, 0) * r.avg_cost_paise)}</td>
              <td className="actions"><button type="button" className="btn-sm" onClick={() => setOpen(r.variant_id)}>{isAdmin ? t('common.edit') : t('common.view')}</button></td>
            </tr>))}
          </tbody>
        </table></div>
      )}
      <Sheet open={!!current} wide title={current?.name} onClose={() => setOpen(null)}>
        {current && <StockEditor key={current.variant_id} row={current} canEdit={isAdmin} />}
      </Sheet>
    </section>
  )
}

function StockEditor({ row, canEdit }: { row: StockRow; canEdit: boolean }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [mode, setMode] = useState<'count' | 'delta'>('count')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [threshold, setThreshold] = useState(String(row.low_threshold))
  const [msg, setMsg] = useState<Msg>(null)
  const moves = useQuery({
    queryKey: ['stock_move', row.variant_id],
    queryFn: () => must<Move[]>(supabase.from('stock_move').select('id, qty, kind, reason, balance_after, at').eq('variant_id', row.variant_id).order('at', { ascending: false }).limit(50)),
  })
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['stock'] }); void qc.invalidateQueries({ queryKey: ['stock_move', row.variant_id] }) }
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'

  const adjust = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null)
    try {
      await must(supabase.rpc('adjust_stock', { p_variant_id: row.variant_id, p_mode: mode, p_qty: Number(qty), p_reason: reason.trim() }))
      setQty(''); setReason(''); setMsg({ kind: 'success', text: t('common.saved') }); refresh()
    } catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) }
  }
  const saveThreshold = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null)
    try {
      await must(supabase.rpc('set_stock_threshold', { p_variant_id: row.variant_id, p_threshold: Number(threshold) }))
      setMsg({ kind: 'success', text: t('common.saved') }); refresh()
    } catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) }
  }
  const qtyOk = qty.trim() !== '' && Number.isInteger(Number(qty)) && (mode === 'delta' ? Number(qty) !== 0 : Number(qty) >= 0)

  return (
    <div className="stack-lg">
      <div className="stats">
        <div className="stat"><div className="label">{t('inventory.onHand')}</div><div className="value num">{row.on_hand}</div></div>
        <div className="stat"><div className="label">{t('inventory.avgCost')}</div><div className="value num">{row.avg_cost_paise ? formatPaise(row.avg_cost_paise) : '—'}</div></div>
      </div>
      <Alert msg={msg} />
      {canEdit && <>
        <form className="stack" onSubmit={saveThreshold} noValidate>
          <h3>{t('inventory.threshold')}</h3>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field grow"><span>{t('inventory.thresholdHint')}</span><input type="number" inputMode="numeric" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
            <button type="submit" disabled={!(Number(threshold) >= 0) || threshold.trim() === ''}>{t('common.save')}</button>
          </div>
        </form>
        <form className="stack" onSubmit={adjust} noValidate>
          <h3>{t('inventory.adjust')}</h3>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="chip"><input type="radio" name="adj-mode" checked={mode === 'count'} onChange={() => setMode('count')} />{t('inventory.modeCount')}</label>
            <label className="chip"><input type="radio" name="adj-mode" checked={mode === 'delta'} onChange={() => setMode('delta')} />{t('inventory.modeDelta')}</label>
          </div>
          <div className="form-grid">
            <label className="field"><span>{mode === 'count' ? t('inventory.countedCases') : t('inventory.deltaCases')}</span>
              <input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
            <label className="field"><span>{t('inventory.reason')}</span>
              <input maxLength={200} placeholder={t('inventory.reasonPh')} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          </div>
          <div className="row"><button type="submit" className="primary" disabled={!qtyOk || reason.trim().length < 2}>{t('inventory.saveAdjust')}</button></div>
        </form>
      </>}
      <div className="stack">
        <h3>{t('inventory.history')}</h3>
        {moves.isLoading ? <Skeleton rows={3} /> : !moves.data?.length ? <p className="muted">{t('inventory.noMoves')}</p> : (
          <div className="table-wrap"><table className="table-stack">
            <thead><tr><th scope="col">{t('audit.when')}</th><th scope="col">{t('inventory.kind')}</th><th scope="col">{t('inventory.change')}</th><th scope="col">{t('inventory.balance')}</th></tr></thead>
            <tbody>{moves.data.map((m) => (
              <tr key={m.id}>
                <td className="lead num nowrap">{new Date(m.at).toLocaleString(loc, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                <td data-label={t('inventory.kind')}>{t(`inventory.kinds.${m.kind}`)}{m.reason && <div className="cell-sub">{m.reason}</div>}</td>
                <td data-label={t('inventory.change')} className="num"><span className={`badge ${m.qty > 0 ? 'badge-green' : 'badge-red'}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</span></td>
                <td data-label={t('inventory.balance')} className="num">{m.balance_after}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
