import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FileSpreadsheet, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { mergeByVariant, parseInvoice, type InvoiceLine } from '../../shared/purchaseImport'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise, rupeesToPaise } from '../../shared/money'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'
import { useStockRows } from './stockRows'

interface Supplier { id: string; name: string; phone: string | null; gstin: string | null; active: boolean }
interface Purchase {
  id: string; supplier_id: string; invoice_no: string | null; purchase_date: string; note: string | null; total_paise: number
  purchase_line: { variant_id: string; qty: number; cost_paise: number }[]
}

const useSuppliers = () => useQuery({
  queryKey: ['supplier'],
  queryFn: () => must<Supplier[]>(supabase.from('supplier').select('*').order('name')),
})
const usePurchases = () => useQuery({
  queryKey: ['purchase'],
  queryFn: () => must<Purchase[]>(supabase.from('purchase').select('*, purchase_line(variant_id, qty, cost_paise)').order('purchase_date', { ascending: false }).order('created_at', { ascending: false }).limit(100)),
})

export default function PurchasesPage() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const suppliers = useSuppliers()
  const purchases = usePurchases()
  const { rows } = useStockRows()
  const [newOpen, setNewOpen] = useState(false)
  const [suppOpen, setSuppOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [view, setView] = useState<string | null>(null)
  const names = new Map(rows.map((r) => [r.variant_id, r.name]))
  const supp = new Map(suppliers.data?.map((s) => [s.id, s.name]))
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'
  const current = purchases.data?.find((p) => p.id === view)

  return (
    <section className="stack-lg">
      <PageHeader title={t('purchases.title')} sub={t('purchases.sub')}
        actions={isAdmin && <>
          <button type="button" onClick={() => setSuppOpen(true)}>{t('purchases.suppliers', { n: suppliers.data?.length ?? 0 })}</button>
          <button type="button" disabled={!suppliers.data?.length} onClick={() => setImportOpen(true)}><FileSpreadsheet size={18} aria-hidden="true" />{t('purchases.importExcel')}</button>
          <button type="button" className="primary" disabled={!suppliers.data?.length} onClick={() => setNewOpen(true)}><Plus size={18} aria-hidden="true" />{t('purchases.new')}</button>
        </>} />
      {isAdmin && suppliers.data && suppliers.data.length === 0 && <Alert msg={{ kind: 'warn', text: t('purchases.addSupplierFirst') }} />}
      {purchases.isLoading ? <Skeleton rows={5} /> : !purchases.data?.length ? (
        <div className="card"><Empty icon={<ShoppingCart size={26} />} title={t('purchases.empty')} /></div>
      ) : (
        <div className="table-wrap"><table className="table-stack">
          <thead><tr><th scope="col">{t('purchases.date')}</th><th scope="col">{t('purchases.supplier')}</th><th scope="col">{t('purchases.invoice')}</th><th scope="col">{t('orders.cases')}</th><th scope="col">{t('purchases.total')}</th><th scope="col"><span className="sr-only">{t('common.view')}</span></th></tr></thead>
          <tbody>{purchases.data.map((p) => (
            <tr key={p.id}>
              <td className="lead num nowrap">{new Date(p.purchase_date).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
              <td data-label={t('purchases.supplier')}>{supp.get(p.supplier_id) ?? '—'}</td>
              <td data-label={t('purchases.invoice')}>{p.invoice_no ?? '—'}</td>
              <td data-label={t('orders.cases')} className="num">{p.purchase_line.reduce((a, l) => a + l.qty, 0)}</td>
              <td data-label={t('purchases.total')} className="num">{formatPaise(p.total_paise)}</td>
              <td className="actions"><button type="button" className="btn-sm" onClick={() => setView(p.id)}>{t('common.view')}</button></td>
            </tr>))}
          </tbody>
        </table></div>
      )}

      <Sheet open={!!current} title={current ? `${supp.get(current.supplier_id) ?? ''} ${current.invoice_no ?? ''}` : ''} onClose={() => setView(null)}>
        {current && <div className="stack">
          {current.note && <p className="muted">{current.note}</p>}
          <ul className="plain-list stack">{current.purchase_line.map((l) => (
            <li key={l.variant_id} className="row-between"><span>{names.get(l.variant_id) ?? '—'}</span>
              <span className="num">{l.qty} × {formatPaise(l.cost_paise)} = <strong>{formatPaise(l.qty * l.cost_paise)}</strong></span></li>))}
          </ul>
          <div className="row-between"><strong>{t('purchases.total')}</strong><strong className="num">{formatPaise(current.total_paise)}</strong></div>
        </div>}
      </Sheet>
      <Sheet open={newOpen} wide title={t('purchases.new')} onClose={() => setNewOpen(false)}>
        {newOpen && <PurchaseForm suppliers={(suppliers.data ?? []).filter((s) => s.active)} items={rows.filter((r) => r.active)} onDone={() => setNewOpen(false)} />}
      </Sheet>
      <Sheet open={importOpen} wide title={t('purchases.importExcel')} onClose={() => setImportOpen(false)}>
        {importOpen && <ImportInvoice suppliers={(suppliers.data ?? []).filter((s) => s.active)} items={rows.filter((r) => r.active)} onDone={() => setImportOpen(false)} />}
      </Sheet>
      <Sheet open={suppOpen} title={t('purchases.suppliersTitle')} onClose={() => setSuppOpen(false)}>
        {suppOpen && <Suppliers list={suppliers.data ?? []} />}
      </Sheet>
    </section>
  )
}

type Line = { variant_id: string; qty: string; cost: string }
const blank = (): Line => ({ variant_id: '', qty: '', cost: '' })

function PurchaseForm({ suppliers, items, onDone }: { suppliers: Supplier[]; items: { variant_id: string; name: string }[]; onDone: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [supplier, setSupplier] = useState(suppliers[0]?.id ?? '')
  const [invoice, setInvoice] = useState('')
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([blank()])
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const lineOk = (l: Line) => l.variant_id && Number.isInteger(Number(l.qty)) && Number(l.qty) >= 1 && Number(l.cost) > 0
  const ids = lines.map((l) => l.variant_id).filter(Boolean)
  const valid = supplier && lines.length > 0 && lines.every(lineOk) && new Set(ids).size === ids.length
  const total = lines.reduce((a, l) => a + (lineOk(l) ? Number(l.qty) * rupeesToPaise(Number(l.cost)) : 0), 0)

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null); setBusy(true)
    try {
      await must(supabase.rpc('record_purchase', {
        p_supplier_id: supplier, p_invoice_no: invoice, p_date: date || null, p_note: note || null,
        p_lines: lines.map((l) => ({ variant_id: l.variant_id, qty: Number(l.qty), cost_paise: rupeesToPaise(Number(l.cost)) })),
      }))
      for (const k of ['purchase', 'stock', 'stock_move']) void qc.invalidateQueries({ queryKey: [k] })
      onDone()
    } catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) }
    finally { setBusy(false) }
  }

  return (
    <form className="stack-lg" onSubmit={submit} noValidate>
      <div className="form-grid">
        <label className="field"><span>{t('purchases.supplier')}</span>
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="field"><span>{t('purchases.invoice')}</span><input maxLength={40} value={invoice} onChange={(e) => setInvoice(e.target.value)} /></label>
        <label className="field"><span>{t('purchases.date')}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>{t('purchases.note')}</span><input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <div className="stack">
        <h3>{t('purchases.lines')}</h3>
        {lines.map((l, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field grow" style={{ minWidth: 220 }}><span>{t('inventory.item')}</span>
              <select value={l.variant_id} onChange={(e) => set(i, { variant_id: e.target.value })}>
                <option value="">—</option>
                {items.map((x) => <option key={x.variant_id} value={x.variant_id} disabled={x.variant_id !== l.variant_id && ids.includes(x.variant_id)}>{x.name}</option>)}
              </select></label>
            <label className="field" style={{ width: 100 }}><span>{t('orders.cases')}</span><input type="number" inputMode="numeric" min={1} value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} /></label>
            <label className="field" style={{ width: 140 }}><span>{t('purchases.costPerCase')}</span><input type="number" inputMode="decimal" min={0} step="0.01" value={l.cost} onChange={(e) => set(i, { cost: e.target.value })} /></label>
            <button type="button" className="ghost icon-btn" aria-label={t('purchases.removeLine')} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 size={18} /></button>
          </div>))}
        <div className="row"><button type="button" onClick={() => setLines([...lines, blank()])}><Plus size={18} aria-hidden="true" />{t('purchases.addLine')}</button></div>
      </div>
      <div className="row-between"><strong>{t('purchases.total')}</strong><strong className="num">{formatPaise(total)}</strong></div>
      <Alert msg={msg} />
      <div className="row"><button type="submit" className="primary" disabled={!valid || busy}>{t('purchases.save')}</button></div>
    </form>
  )
}

function Suppliers({ list }: { list: Supplier[] }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const refresh = () => void qc.invalidateQueries({ queryKey: ['supplier'] })
  const add = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null)
    try {
      await must(supabase.from('supplier').insert({ name: name.trim(), phone: phone.trim() || null }).select())
      setName(''); setPhone(''); refresh()
    } catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) }
  }
  const toggle = async (s: Supplier) => {
    try { await must(supabase.from('supplier').update({ active: !s.active }).eq('id', s.id).select()); refresh() }
    catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) }
  }
  return (
    <div className="stack-lg">
      <ul className="plain-list stack">{list.map((s) => (
        <li key={s.id} className={`row-between ${s.active ? '' : 'dim'}`}>
          <div><div className="cell-title">{s.name}</div>{s.phone && <div className="cell-sub">{s.phone}</div>}</div>
          <label className="chip"><input type="checkbox" checked={s.active} onChange={() => void toggle(s)} />{t('users.active')}</label>
        </li>))}
      </ul>
      <form className="stack" onSubmit={add} noValidate>
        <div className="form-grid">
          <label className="field"><span>{t('purchases.supplierName')}</span><input maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>{t('purchases.phone')}</span><input inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} /></label>
        </div>
        <Alert msg={msg} />
        <div className="row"><button type="submit" disabled={!name.trim() || (phone !== '' && !/^[6-9]\d{9}$/.test(phone))}><Plus size={18} aria-hidden="true" />{t('purchases.addSupplier')}</button></div>
      </form>
    </div>
  )
}

function cellValue(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string }
    if ('result' in o) return o.result
    if (o.richText) return o.richText.map((r) => r.text).join('')
    if (o.text !== undefined) return o.text
  }
  return v
}

/** Pepsi invoice/order Excel -> purchase. SKU codes are matched to flavours once and remembered. */
function ImportInvoice({ suppliers, items, onDone }: { suppliers: Supplier[]; items: { variant_id: string; name: string }[]; onDone: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [supplier, setSupplier] = useState(suppliers[0]?.id ?? '')
  const [invoice, setInvoice] = useState('')
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
  const [lines, setLines] = useState<InvoiceLine[] | null>(null)
  const [map, setMap] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)

  const read = async (file: File | undefined) => {
    if (!file) return
    setMsg(null); setBusy(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const grid: unknown[][] = []
      wb.worksheets[0].eachRow({ includeEmpty: true }, (row) => { grid.push((row.values as unknown[]).slice(1).map(cellValue)) })
      const parsed = parseInvoice(grid)
      const known = await must<{ sku_code: string; variant_id: string }[]>(supabase.from('supplier_sku').select('sku_code, variant_id').eq('supplier_id', supplier))
      setMap(Object.fromEntries(known.map((k) => [k.sku_code, k.variant_id])))
      setLines(parsed)
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message === 'SHEET_FORMAT' ? t('purchases.badSheet') : errorMessage(t, err) })
    } finally { setBusy(false) }
  }

  const matched = (lines ?? []).filter((l) => map[l.sku])
  const total = (lines ?? []).reduce((a, l) => a + l.valuePaise, 0)
  const save = async () => {
    if (!lines) return
    setMsg(null); setBusy(true)
    try {
      await must(supabase.from('supplier_sku').upsert(matched.map((l) => ({ supplier_id: supplier, sku_code: l.sku, variant_id: map[l.sku] }))).select())
      await must(supabase.rpc('record_purchase', {
        p_supplier_id: supplier, p_invoice_no: invoice, p_date: date || null, p_note: null,
        p_lines: mergeByVariant(matched.map((l) => ({ variant_id: map[l.sku], qty: l.qty, valuePaise: l.valuePaise }))),
      }))
      for (const k of ['purchase', 'stock', 'stock_move', 'month_stats']) void qc.invalidateQueries({ queryKey: [k] })
      onDone()
    } catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) }
    finally { setBusy(false) }
  }

  return (
    <div className="stack-lg">
      <div className="form-grid">
        <label className="field"><span>{t('purchases.supplier')}</span>
          <select value={supplier} disabled={!!lines} onChange={(e) => setSupplier(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="field"><span>{t('purchases.invoice')}</span><input maxLength={40} value={invoice} onChange={(e) => setInvoice(e.target.value)} /></label>
        <label className="field"><span>{t('purchases.date')}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>{t('purchases.excelFile')}</span><input type="file" accept=".xlsx" disabled={busy || !supplier} onChange={(e) => void read(e.target.files?.[0])} /></label>
      </div>
      <p className="muted">{t('purchases.importHint')}</p>
      {lines && <>
        <div className="table-wrap"><table className="table-stack">
          <thead><tr><th scope="col">{t('purchases.pepsiItem')}</th><th scope="col">{t('orders.cases')}</th><th scope="col">{t('purchases.costPerCase')}</th><th scope="col">{t('inventory.item')}</th></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.sku}>
              <td className="lead"><div className="cell-title">{l.desc}</div><div className="cell-sub">SKU {l.sku}</div></td>
              <td data-label={t('orders.cases')} className="num">{l.qty}</td>
              <td data-label={t('purchases.costPerCase')} className="num">{formatPaise(Math.round(l.valuePaise / l.qty))}</td>
              <td data-label={t('inventory.item')}>
                <select aria-label={`${t('inventory.item')}: ${l.desc}`} value={map[l.sku] ?? ''} onChange={(e) => setMap({ ...map, [l.sku]: e.target.value })}>
                  <option value="">{t('purchases.skipLine')}</option>
                  {items.map((x) => <option key={x.variant_id} value={x.variant_id}>{x.name}</option>)}
                </select></td>
            </tr>))}</tbody>
        </table></div>
        <div className="row-between"><span>{t('purchases.matched', { n: matched.length, total: lines.length })}</span><strong className="num">{formatPaise(total)}</strong></div>
        {matched.length < lines.length && <Alert msg={{ kind: 'warn', text: t('purchases.unmatched', { n: lines.length - matched.length }) }} />}
      </>}
      <Alert msg={msg} />
      <div className="row"><button type="button" className="primary" disabled={busy || !matched.length} onClick={() => void save()}>{t('purchases.save')}</button></div>
    </div>
  )
}