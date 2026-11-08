import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Save, Store, Trash2, X } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise } from '../../shared/money'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Skeleton, type Msg } from '../../shared/ui/kit'
import { Stepper } from '../../shared/ui/Stepper'
import { useConfirm } from '../../shared/ui/confirm'
import { VoiceSale, type VoiceResult } from './VoiceSale'
import { refreshMoney } from './money'
import { PaidIntoSelect } from './PaidIntoSelect'

export interface CounterLine { variant_id: string; item: string; qty: number; price_paise: number }
export interface CounterBill {
  id: string; number: string; at: string; shop: string; shop_id: string; locality: string | null; phone: string | null; owner: string | null
  mode: 'cash' | 'upi'; total_paise: number; by: string | null; voided: boolean; void_reason: string | null
  margin_paise: number | null; lines: CounterLine[]
}
interface CatalogRow { variant_id: string; label: string; trade_paise: number; buy_paise: number | null; floor_paise: number | null; on_hand: number }
interface ShopRow { id: string; name: string; phone: string | null; locality: string | null; owner_name: string | null }
interface Line { variant_id: string; qty: number; rate: string }

const useCounterCatalog = () => useQuery({
  queryKey: ['counter-catalog'],
  queryFn: () => must<CatalogRow[]>(supabase.rpc('counter_catalog')),
})
const useShopPicker = () => useQuery({
  queryKey: ['shop', 'picker'],
  queryFn: () => must<ShopRow[]>(supabase.from('shop').select('id, name, phone, locality, owner_name').eq('active', true).order('name').limit(5000)),
})
const MIN_RATE = 20

/** New counter sale or edit of an existing one. Saves through counter_sale_save, so stock and checks match Telegram and the sheet. */
export function CounterSaleForm({ bill, paidInto, onDone }: { bill?: CounterBill; paidInto?: string; onDone: (number?: string) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const isAdmin = useAuth().profile?.role === 'admin'
  const catalog = useCounterCatalog()
  const shops = useShopPicker()
  const [action] = useState(() => crypto.randomUUID())
  const [shop, setShop] = useState<ShopRow | null>(bill ? { id: bill.shop_id, name: bill.shop, phone: bill.phone, locality: bill.locality, owner_name: bill.owner ?? null } : null)
  const [shopQ, setShopQ] = useState('')
  const [lines, setLines] = useState<Line[]>(() => (bill?.lines ?? []).map((l) => ({ variant_id: l.variant_id, qty: l.qty, rate: String(l.price_paise / 100) })))
  const [itemQ, setItemQ] = useState('')
  const [mode, setMode] = useState<'cash' | 'upi'>(bill?.mode ?? 'cash')
  // '' = the default for the mode (cash box / company bank); a picked account is saved with the bill.
  const [account, setAccount] = useState(paidInto ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  const byId = useMemo(() => new Map((catalog.data ?? []).map((c) => [c.variant_id, c])), [catalog.data])
  // Stock free for this bill: warehouse stock plus what this bill already holds.
  const held = useMemo(() => new Map((bill?.lines ?? []).map((l) => [l.variant_id, l.qty])), [bill])
  const free = (id: string) => (byId.get(id)?.on_hand ?? 0) + (held.get(id) ?? 0)

  const sq = shopQ.trim().toLowerCase()
  const shopHits = sq.length < 2 ? [] : (shops.data ?? []).filter((s) => `${s.name} ${s.owner_name ?? ''} ${s.phone ?? ''} ${s.locality ?? ''}`.toLowerCase().includes(sq)).slice(0, 8)
  const iq = itemQ.trim().toLowerCase()
  const itemHits = !iq ? [] : (catalog.data ?? []).filter((c) => c.label.toLowerCase().includes(iq) && !lines.some((l) => l.variant_id === c.variant_id))
    .sort((a, b) => Number(b.on_hand > 0) - Number(a.on_hand > 0) || a.label.localeCompare(b.label)).slice(0, 8)

  const paise = (r: string) => Math.round(Number(r) * 100)
  const lineBad = (l: Line) => !Number.isInteger(l.qty) || l.qty < 1 || l.qty > 9999 || !(Number(l.rate) >= MIN_RATE) || Number(l.rate) > 100000
  const cases = lines.reduce((a, l) => a + l.qty, 0)
  const total = lines.reduce((a, l) => a + l.qty * (paise(l.rate) || 0), 0)
  const margin = lines.reduce((a, l) => a + l.qty * ((paise(l.rate) || 0) - (byId.get(l.variant_id)?.buy_paise ?? 0)), 0)
  const belowFloor = lines.filter((l) => { const f = byId.get(l.variant_id)?.floor_paise; return f != null && paise(l.rate) < f })
  const problem = !shop ? t('sales.form.needShop') : !lines.length ? t('sales.form.needItem') : lines.some(lineBad) ? t('sales.form.badLine', { min: MIN_RATE }) : null

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const addItem = (c: CatalogRow) => { setLines((ls) => [...ls, { variant_id: c.variant_id, qty: 1, rate: String(c.trade_paise / 100) }]); setItemQ('') }

  const save = async () => {
    if (problem || !shop) return
    if (belowFloor.length && !(await confirm({ title: t('pricing.belowFloorTitle'), body: t('pricing.belowFloorBody', { n: belowFloor.length }), confirm: t('common.save'), danger: true }))) return
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('counter_sale_save_into', {
      p_id: bill?.id ?? null, p_action: action, p_shop: shop.id, p_mode: mode, p_account: account || null,
      p_lines: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, price_paise: paise(l.rate) })),
    })
    setBusy(false)
    if (error) { setMsg({ kind: 'error', text: errorMessage(t, error) }); return }
    for (const k of ['counter-sales', 'counter-catalog', 'stock', 'stock_move', 'month_stats']) void qc.invalidateQueries({ queryKey: [k] })
    refreshMoney(qc)
    onDone((data as { number: string }).number)
  }

  // Voice / typed note -> prefill. Same item replaces its line; nothing is saved until the user taps Save.
  const applyVoice = (r: VoiceResult) => {
    if (r.shop) setShop(r.shop)
    else if (r.shopHint) { setShop(null); setShopQ(r.shopHint) }
    if (r.lines.length) setLines((ls) => {
      const out = [...ls]
      for (const v of r.lines) {
        if (!byId.has(v.variant_id)) continue
        const line = { variant_id: v.variant_id, qty: v.qty, rate: String(v.price_paise / 100) }
        const i = out.findIndex((l) => l.variant_id === v.variant_id)
        if (i >= 0) out[i] = line; else out.push(line)
      }
      return out
    })
    if (r.mode) setMode(r.mode)
    if (r.account_id) setAccount(r.account_id)
  }

  if (catalog.isLoading || shops.isLoading) return <Skeleton rows={4} />
  return (
    <div className="stack-lg">
      {!bill && <VoiceSale onResult={applyVoice} />}
      {/* Shop */}
      <div className="stack">
        <span className="cell-title">{t('sales.form.shop')}</span>
        {shop ? (
          <div className="row-between card" style={{ padding: '10px 12px' }}>
            <span className="row"><Store size={18} aria-hidden="true" /><span><strong>{shop.name}</strong>{shop.owner_name && <span className="muted"> · {shop.owner_name}</span>}
              <span className="cell-sub" style={{ display: 'block' }}>{[shop.locality, shop.phone].filter(Boolean).join(' · ') || '—'}</span></span></span>
            <button type="button" className="btn-sm ghost" onClick={() => { setShop(null); setShopQ('') }} aria-label={t('sales.form.changeShop')}><X size={16} aria-hidden="true" />{t('sales.form.changeShop')}</button>
          </div>
        ) : (
          <>
            <label className="field"><span className="sr-only">{t('sales.form.searchShop')}</span>
              <input type="search" autoFocus value={shopQ} onChange={(e) => setShopQ(e.target.value)} placeholder={t('sales.form.searchShop')} aria-label={t('sales.form.searchShop')} /></label>
            {sq.length >= 2 && (shopHits.length ? (
              <ul className="plain-list stack" style={{ gap: 4 }}>{shopHits.map((s) => (
                <li key={s.id}><button type="button" className="btn-block" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => setShop(s)}>
                  <Store size={16} aria-hidden="true" /><span className="grow"><strong>{s.name}</strong>{s.owner_name && <span className="muted"> · {s.owner_name}</span>}
                    <span className="cell-sub" style={{ display: 'block' }}>{[s.locality, s.phone].filter(Boolean).join(' · ')}</span></span></button></li>))}
              </ul>) : <p className="muted">{t('sales.form.noShop')}</p>)}
          </>
        )}
      </div>

      {/* Items */}
      <div className="stack">
        <span className="cell-title">{t('sales.form.items')}</span>
        {lines.length > 0 && (
          <ul className="plain-list">{lines.map((l, i) => {
            const c = byId.get(l.variant_id)
            const over = l.qty > free(l.variant_id)
            const low = c?.floor_paise != null && paise(l.rate) < c.floor_paise
            const label = c?.label ?? bill?.lines.find((x) => x.variant_id === l.variant_id)?.item ?? ''
            return (
              <li key={l.variant_id} className="cart-line" data-testid="sale-line">
                <div className="grow">
                  <div className="cell-title">{label}</div>
                  <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <label className="row" style={{ gap: 4 }}><span className="cell-sub">{t('sales.form.rate')} ₹</span>
                      <input type="number" inputMode="decimal" min={MIN_RATE} step="0.5" style={{ width: 96 }} value={l.rate}
                        aria-label={`${t('sales.form.rate')}: ${label}`} aria-invalid={!(Number(l.rate) >= MIN_RATE)} onChange={(e) => setLine(i, { rate: e.target.value })} /></label>
                    <span className="cell-sub num">= {formatPaise(l.qty * (paise(l.rate) || 0))}</span>
                    {over && <span className="badge badge-amber">{t('sales.form.overStock', { n: Math.max(0, free(l.variant_id)) })}</span>}
                    {low && <span className="badge badge-red">{t('sales.form.belowFloor', { floor: formatPaise(c!.floor_paise!) })}</span>}
                  </div>
                </div>
                <Stepper value={l.qty} max={9999} onChange={(n) => (n === 0 ? setLines((ls) => ls.filter((_, j) => j !== i)) : setLine(i, { qty: n }))} label={label} />
                <button type="button" className="btn-sm ghost icon-btn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`${t('sales.form.remove')}: ${label}`}><Trash2 size={16} aria-hidden="true" /></button>
              </li>)
          })}</ul>
        )}
        <label className="field"><span className="sr-only">{t('sales.form.addItem')}</span>
          <input type="search" value={itemQ} onChange={(e) => setItemQ(e.target.value)} placeholder={t('sales.form.addItem')} aria-label={t('sales.form.addItem')} /></label>
        {itemHits.length > 0 && (
          <ul className="plain-list stack" style={{ gap: 4 }}>{itemHits.map((c) => (
            <li key={c.variant_id}><button type="button" className="btn-block" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => addItem(c)}>
              <Plus size={16} aria-hidden="true" /><span className="grow">{c.label}</span>
              <span className="cell-sub num">{formatPaise(c.trade_paise)} · {t('sales.form.inStock', { n: c.on_hand })}</span></button></li>))}
          </ul>
        )}
        {iq && !itemHits.length && <p className="muted">{t('common.noMatches')}</p>}
      </div>

      {/* Payment */}
      <fieldset className="days"><legend className="cell-title" style={{ marginBottom: 6 }}>{t('sales.form.pay')}</legend>
        {(['cash', 'upi'] as const).map((m) => <label key={m} className="day-toggle"><input type="radio" name="cs-mode" checked={mode === m} onChange={() => setMode(m)} /><span>{m === 'cash' ? t('driver.cash') : 'UPI'}</span></label>)}
      </fieldset>
      <PaidIntoSelect value={account} mode={mode} onChange={setAccount} id="cs-paid-into" />

      <div className="row-between total-row"><span>{t('shop.casesCount', { count: cases })}</span><strong className="num">{formatPaise(total)}</strong></div>
      {isAdmin && lines.length > 0 && <p className={`cell-sub num ${margin < 0 ? 'text-warn' : ''}`}>{t('sales.margin')}: {formatPaise(margin)}</p>}
      {problem && (shop || lines.length > 0) && <p className="cell-sub">{problem}</p>}
      <Alert msg={msg} />
      <div className="sheet-foot">
        <button type="button" onClick={() => onDone()}>{t('common.cancel')}</button>
        <button type="button" className="primary" disabled={busy || !!problem} onClick={() => void save()}>
          <Save size={18} aria-hidden="true" />{busy ? t('common.loading') : bill ? t('sales.form.saveChanges') : t('sales.form.saveSale')}</button>
      </div>
    </div>
  )
}
