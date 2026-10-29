import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../shared/api/supabase'
import { must, usePacks, type Pack, type PriceList, type PriceListItem } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise } from '../../shared/money'
import { netRate, parseRupees, shopMargin } from '../../shared/pricing'
import { matchRows, parseSheet, type ImportResult, type PackRef } from '../../shared/priceImport'
import { errorMessage } from '../../shared/ui/errors'
import { CircleCheck, Copy, FileSpreadsheet, Tags, Trash2 } from 'lucide-react'
import { Alert, Empty, PageHeader, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'
import { useConfirm } from '../../shared/ui/confirm'

const usePriceLists = () => useQuery({
  queryKey: ['price_list'],
  queryFn: () => must<PriceList[]>(supabase.from('price_list').select('*').order('effective_from', { ascending: false }).order('created_at', { ascending: false })),
})

export default function PriceListsPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const qc = useQueryClient()
  const confirm = useConfirm()
  const lists = usePriceLists()
  const packs = usePacks()
  const [selected, setSelected] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  const current = lists.data?.find((l) => l.id === (selected ?? lists.data?.find((x) => x.status === 'active')?.id ?? lists.data?.[0]?.id))
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['price_list'] }); void qc.invalidateQueries({ queryKey: ['price_list_item'] }) }

  const copyAsDraft = async (from: PriceList) => {
    setMsg(null)
    try {
      const [pl] = await must<PriceList[]>(supabase.from('price_list').insert({
        name: `${from.name} (copy)`, effective_from: new Date().toISOString().slice(0, 10), price_includes_gst: from.price_includes_gst,
      }).select())
      const items = await must<PriceListItem[]>(supabase.from('price_list_item').select('*').eq('price_list_id', from.id))
      if (items.length) await must(supabase.from('price_list_item').insert(items.map(({ pack_id, trade_price_paise, scheme_value_paise, scheme_type, remarks }) =>
        ({ price_list_id: pl.id, pack_id, trade_price_paise, scheme_value_paise, scheme_type, remarks }))).select('id'))
      setSelected(pl.id); refresh()
    } catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) }
  }

  const activate = async (pl: PriceList) => {
    if (!(await confirm({ title: t('prices.activate'), body: t('prices.confirmActivate', { name: pl.name }), confirm: t('prices.activate') }))) return
    setMsg(null)
    const { error } = await supabase.rpc('activate_price_list', { p_id: pl.id })
    if (error) setMsg({ kind: 'error', text: errorMessage(t, error) })
    else { setMsg({ kind: 'success', text: t('prices.activated') }); refresh() }
  }

  const remove = async (pl: PriceList) => {
    if (!(await confirm({ title: t('common.delete'), body: t('prices.confirmDelete', { name: pl.name }), confirm: t('common.delete'), danger: true }))) return
    try { await must(supabase.from('price_list').delete().eq('id', pl.id).select('id')); setSelected(null); refresh() }
    catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) }
  }

  const hasLive = lists.data?.some((l) => l.status === 'active')
  const statusBadge = (s: PriceList['status']) => s === 'active' ? 'badge-green' : s === 'draft' ? 'badge-amber' : ''

  return (
    <section className="stack-lg">
      <PageHeader title={t('prices.title')} sub={t('prices.sub')}
        actions={isAdmin && <button type="button" className="primary" onClick={() => setImporting(true)}><FileSpreadsheet size={18} aria-hidden="true" />{t('prices.import')}</button>} />
      {lists.data && !hasLive && <Alert msg={{ kind: 'warn', text: t('prices.noLive') }} />}
      <Alert msg={msg} />

      {lists.isLoading ? <Skeleton /> : !lists.data?.length ? (
        <div className="card"><Empty icon={<Tags size={26} />} title={t('prices.empty')} /></div>
      ) : (
        <div className="segmented" role="tablist" aria-label={t('prices.title')}>
          {lists.data.map((l) => (
            <button key={l.id} type="button" role="tab" aria-selected={current?.id === l.id} className="btn-sm" onClick={() => setSelected(l.id)}>
              {l.name} <span className={`badge ${statusBadge(l.status)}`}>{t(`prices.status.${l.status}`)}</span>
            </button>
          ))}
        </div>
      )}

      {current && packs.data && (
        <div className="stack">
          <div className="card row-between" style={{ flexWrap: 'wrap' }}>
            <div>
              <div className="row"><h2>{current.name}</h2><span className={`badge ${statusBadge(current.status)}`}>{t(`prices.status.${current.status}`)}</span></div>
              <p className="muted" style={{ marginTop: 4 }}>{t('prices.effective')}: {new Date(current.effective_from).toLocaleDateString()} · {current.price_includes_gst ? t('prices.inclGst') : t('prices.exclGst')}</p>
            </div>
            {isAdmin && (
              <div className="page-actions">
                <button type="button" className="btn-sm" onClick={() => void copyAsDraft(current)}><Copy size={16} aria-hidden="true" />{t('prices.copy')}</button>
                {current.status === 'draft' && <>
                  <button type="button" className="btn-sm danger" onClick={() => void remove(current)}><Trash2 size={16} aria-hidden="true" />{t('common.delete')}</button>
                  <button type="button" className="btn-sm primary" onClick={() => void activate(current)}><CircleCheck size={16} aria-hidden="true" />{t('prices.activate')}</button>
                </>}
              </div>
            )}
          </div>
          {current.status === 'draft' && isAdmin && <Alert msg={{ kind: 'warn', text: t('prices.draftHint') }} />}
          <ItemsTable list={current} packs={packs.data} editable={isAdmin && current.status === 'draft'} />
        </div>
      )}

      <Sheet open={importing} wide title={t('prices.import')} onClose={() => setImporting(false)}>
        {importing && packs.data && <ImportPanel packs={packs.data} onDone={(id) => { setImporting(false); setSelected(id); refresh() }} />}
      </Sheet>
    </section>
  )
}

function ItemsTable({ list, packs, editable }: { list: PriceList; packs: Pack[]; editable: boolean }) {
  const { t } = useTranslation()
  const items = useQuery({
    queryKey: ['price_list_item', list.id],
    queryFn: () => must<PriceListItem[]>(supabase.from('price_list_item').select('*').eq('price_list_id', list.id)),
  })
  const byPack = useMemo(() => new Map(items.data?.map((i) => [i.pack_id, i])), [items.data])
  if (items.isLoading) return <Skeleton rows={6} />

  return (
    <div className="table-wrap table-scroll"><table className="dense">
      <thead><tr>
        <th scope="col">{t('prices.pack')}</th><th scope="col">{t('prices.units')}</th><th scope="col">MRP</th>
        <th scope="col">{t('prices.trade')}</th><th scope="col">{t('prices.scheme')}</th><th scope="col">{t('prices.type')}</th>
        <th scope="col">{t('prices.net')}</th><th scope="col">{t('prices.margin')}</th>
      </tr></thead>
      <tbody>{packs.filter((p) => byPack.has(p.id) || editable).map((p) => (
        <ItemRow key={`${p.id}-${byPack.get(p.id)?.id ?? 'new'}`} pack={p} item={byPack.get(p.id)} listId={list.id} editable={editable} />
      ))}</tbody>
    </table></div>
  )
}

function ItemRow({ pack, item, listId, editable }: { pack: Pack; item?: PriceListItem; listId: string; editable: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [trade, setTrade] = useState(item ? String(item.trade_price_paise / 100) : '')
  const [scheme, setScheme] = useState(item ? String(item.scheme_value_paise / 100) : '0')
  const [type, setType] = useState<PriceListItem['scheme_type']>(item?.scheme_type ?? 'net_rate')
  const [error, setError] = useState<string | null>(null)

  const tp = parseRupees(trade), sv = parseRupees(scheme) ?? 0
  const valid = tp !== null && tp > 0 && sv >= 0 && sv < tp
  const price = valid ? { units_per_case: pack.units_per_case, mrp_paise: pack.mrp_paise, trade_price_paise: tp, scheme_value_paise: sv } : null
  const dirty = !item || tp !== item.trade_price_paise || sv !== item.scheme_value_paise || type !== item.scheme_type

  const save = async () => {
    if (!dirty) return
    setError(null)
    try {
      if (!trade.trim() && item) await must(supabase.from('price_list_item').delete().eq('id', item.id).select('id'))
      else if (valid) await must(supabase.from('price_list_item').upsert({
        price_list_id: listId, pack_id: pack.id, trade_price_paise: tp, scheme_value_paise: sv, scheme_type: type,
      }, { onConflict: 'price_list_id,pack_id' }).select('id'))
      else { setError(t('prices.invalid')); return }
      void qc.invalidateQueries({ queryKey: ['price_list_item', listId] })
    } catch (err) { setError(errorMessage(t, err)) }
  }

  return (
    <tr className={item ? '' : 'dim'}>
      <th scope="row">{pack.name_en}{error && <p className="error" role="alert">{error}</p>}</th>
      <td>{pack.units_per_case}</td><td>{formatPaise(pack.mrp_paise)}</td>
      {editable ? <>
        <td><input aria-label={`${pack.name_en} ${t('prices.trade')}`} inputMode="decimal" size={6} value={trade} onChange={(e) => setTrade(e.target.value)} onBlur={() => void save()} /></td>
        <td><input aria-label={`${pack.name_en} ${t('prices.scheme')}`} inputMode="decimal" size={5} value={scheme} onChange={(e) => setScheme(e.target.value)} onBlur={() => void save()} /></td>
        <td><select aria-label={`${pack.name_en} ${t('prices.type')}`} value={type} onChange={(e) => setType(e.target.value as PriceListItem['scheme_type'])} onBlur={() => void save()}>
          <option value="net_rate">{t('prices.netRate')}</option><option value="bogo_on_mrp">BOGO</option></select></td>
      </> : <>
        <td>{item ? formatPaise(item.trade_price_paise) : '—'}</td>
        <td>{item ? formatPaise(item.scheme_value_paise) : '—'}</td>
        <td>{item?.scheme_type === 'bogo_on_mrp' ? 'BOGO' : t('prices.netRate')}</td>
      </>}
      <td><strong>{price ? formatPaise(netRate(price)) : '—'}</strong></td>
      <td>{price ? formatPaise(shopMargin(price)) : '—'}</td>
    </tr>
  )
}

/** Reads cell values from exceljs, unwrapping formulas and rich text. */
function cellValue(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string }
    if ('result' in o) return o.result
    if (o.richText) return o.richText.map((r) => r.text).join('')
    if (o.text !== undefined) return o.text
  }
  return v
}

function ImportPanel({ packs, onDone }: { packs: Pack[]; onDone: (listId: string) => void }) {
  const { t } = useTranslation()
  const [result, setResult] = useState<ImportResult | null>(null)
  const [name, setName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [mapping, setMapping] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refs: PackRef[] = packs.map((p) => ({ id: p.id, source_name: p.source_name, name_en: p.name_en, units_per_case: p.units_per_case, mrp_paise: p.mrp_paise }))

  const read = async (file: File | undefined) => {
    if (!file) return
    setError(null); setResult(null); setBusy(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      const grid: unknown[][] = []
      ws.eachRow({ includeEmpty: true }, (row) => {
        const vals = (row.values as unknown[]).slice(1).map(cellValue)
        grid.push(vals)
      })
      const res = matchRows(parseSheet(grid), refs)
      setResult(res)
      setName(`PepsiCo ${date.split('-').reverse().join('-')}`)
    } catch (err) {
      setError((err as Error).message === 'SHEET_FORMAT' ? t('prices.badSheet') : errorMessage(t, err))
    } finally { setBusy(false) }
  }

  const create = async () => {
    if (!result) return
    setBusy(true); setError(null)
    try {
      const [pl] = await must<PriceList[]>(supabase.from('price_list').insert({ name: name.trim(), effective_from: date }).select())
      const rows = [
        ...result.matched.map((m) => ({ pack_id: m.pack.id, row: m.row })),
        ...result.unmatched.filter((u) => mapping[u.rowNo] && u.trade_price_paise).map((u) => ({ pack_id: mapping[u.rowNo], row: u })),
      ]
      const seen = new Set<string>()
      const items = rows.filter((r) => !seen.has(r.pack_id) && seen.add(r.pack_id)).map(({ pack_id, row }) => ({
        price_list_id: pl.id, pack_id, trade_price_paise: row.trade_price_paise!,
        scheme_value_paise: row.scheme_value_paise, scheme_type: row.bogo ? 'bogo_on_mrp' : 'net_rate',
      }))
      await must(supabase.from('price_list_item').insert(items).select('id'))
      // Remember the sheet name for packs mapped by hand so next month's import matches automatically.
      for (const u of result.unmatched) if (mapping[u.rowNo]) await supabase.from('pack').update({ source_name: u.name }).eq('id', mapping[u.rowNo]).is('source_name', null)
      onDone(pl.id)
    } catch (err) { setError(errorMessage(t, err)) }
    finally { setBusy(false) }
  }

  const warned = result?.matched.filter((m) => m.warnings.length) ?? []
  return (
    <div className="stack-lg">
      <p className="muted">{t('prices.importHint')}</p>
      <label className="button btn-block" style={{ borderStyle: 'dashed', minHeight: 72 }}>
        <FileSpreadsheet size={20} aria-hidden="true" />{busy ? t('common.loading') : t('prices.chooseFile')}
        <input type="file" accept=".xlsx" disabled={busy} onChange={(e) => void read(e.target.files?.[0])} /></label>
      <Alert msg={error ? { kind: 'error', text: error } : null} />
      {result && (
        <div className="stack">
          <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="stat"><div className="label">{t('prices.matchedLabel')}</div><div className="value" style={{ color: 'var(--brand-700)' }}>{result.matched.length}</div></div>
            <div className="stat"><div className="label">{t('prices.unmatchedLabel')}</div><div className="value" style={{ color: result.unmatched.length ? 'var(--warn)' : undefined }}>{result.unmatched.length}</div></div>
          </div>
          {warned.length > 0 && (
            <div className="alert alert-warn"><ul className="plain-list">{warned.map((m) => (
              <li key={m.row.rowNo}><strong>{m.row.name}</strong>: {m.warnings.map((w) => t(`prices.warn.${w}`)).join(', ')}</li>))}</ul></div>
          )}
          {result.unmatched.map((u) => (
            <label key={u.rowNo} className="field"><span>{t('prices.mapRow', { row: u.rowNo, name: u.name })}</span>
              <select value={mapping[u.rowNo] ?? ''} onChange={(e) => setMapping({ ...mapping, [u.rowNo]: e.target.value })}>
                <option value="">{t('prices.skip')}</option>
                {packs.map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
              </select></label>
          ))}
          <div className="form-grid">
            <label className="field"><span>{t('prices.listName')}</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="field"><span>{t('prices.effective')}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <div className="sheet-foot">
            <button type="button" className="primary" disabled={busy || !name.trim() || !result.matched.length} onClick={() => void create()}>{t('prices.createDraft')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
