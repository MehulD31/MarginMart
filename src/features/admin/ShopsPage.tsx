import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CircleCheck, FileSpreadsheet, Download, Pencil, Phone, Plus, Store } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must, useRoutes, type Route, type Shop } from '../../shared/api/db'
import { callFunction } from '../../shared/api/functions'
import { formatPaise } from '../../shared/money'
import { parseRupees } from '../../shared/pricing'
import { csvRecords, toCsv } from '../../shared/csv'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton, StatusBadge } from '../../shared/ui/kit'
import { PinIssued, type Issued } from './PinIssued'
import { downloadText } from '../../shared/ui/util'

const useShops = () => useQuery({
  queryKey: ['shop'],
  queryFn: () => must<Shop[]>(supabase.from('shop').select('*').order('stop_seq').order('name')),
})
const useShopLogins = () => useQuery({
  queryKey: ['profiles', 'shop'],
  queryFn: async () => {
    const rows = await must<{ shop_id: string; active: boolean }[]>(supabase.from('profiles').select('shop_id, active').eq('role', 'shop'))
    return new Set(rows.filter((r) => r.active).map((r) => r.shop_id))
  },
})

const PHONE = /^[6-9]\d{9}$/
const GSTIN = /^\d{2}[A-Z0-9]{13}$/

export default function ShopsPage() {
  const { t } = useTranslation()
  const shops = useShops()
  const logins = useShopLogins()
  const routes = useRoutes()
  const [routeFilter, setRouteFilter] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Partial<Shop> | null>(null)
  const [importing, setImporting] = useState(false)
  const [issued, setIssued] = useState<Issued[]>([])

  const routeName = useMemo(() => new Map(routes.data?.map((r) => [r.id, r.name])), [routes.data])
  const all = shops.data ?? []
  const list = all.filter((s) => (!routeFilter || s.route_id === routeFilter)
    && (!q || `${s.name} ${s.owner_name ?? ''} ${s.phone ?? ''} ${s.code ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const withLogin = all.filter((s) => logins.data?.has(s.id)).length

  return (
    <section className="stack-lg">
      <PageHeader title={t('shops.title')} sub={t('shops.sub', { n: all.length, l: withLogin })}
        actions={<>
          <button type="button" onClick={() => setImporting(true)}><FileSpreadsheet size={18} aria-hidden="true" />{t('shops.importCsv')}</button>
          <button type="button" className="primary" onClick={() => setEditing({ credit_days: 7, credit_limit_paise: 0, active: true, route_id: routeFilter || routes.data?.[0]?.id })}>
            <Plus size={18} aria-hidden="true" />{t('shops.add')}</button>
        </>} />

      <div className="stack">
        <input type="search" aria-label={t('shops.searchLabel')} placeholder={t('shops.searchLabel')} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 420 }} />
        <div className="segmented" role="tablist" aria-label={t('shops.route')}>
          {[{ id: '', name: t('common.all') }, ...(routes.data ?? [])].map((r) => (
            <button key={r.id || 'all'} type="button" role="tab" className="btn-sm" aria-selected={routeFilter === r.id} onClick={() => setRouteFilter(r.id)}>
              {r.name} <span className="muted">{all.filter((s) => !r.id || s.route_id === r.id).length}</span>
            </button>
          ))}
        </div>
      </div>

      {shops.isLoading ? <Skeleton rows={4} /> : all.length === 0 ? (
        <div className="card"><Empty icon={<Store size={26} />} title={t('shops.empty')}>
          <p>{t('shops.emptyHint')}</p>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" onClick={() => setImporting(true)}><FileSpreadsheet size={18} aria-hidden="true" />{t('shops.importCsv')}</button>
          </div>
        </Empty></div>
      ) : list.length === 0 ? (
        <p className="muted">{t('common.noMatches')}</p>
      ) : (
        <div className="table-wrap">
          <table className="table-stack">
            <thead><tr>
              <th scope="col">{t('shops.name')}</th><th scope="col">{t('shops.route')}</th>
              <th scope="col">{t('shops.creditLimit')}</th><th scope="col">{t('shops.login')}</th>
              <th scope="col"><span className="sr-only">{t('common.actions')}</span></th>
            </tr></thead>
            <tbody>{list.map((s) => (
              <tr key={s.id} className={s.active ? '' : 'dim'}>
                <td className="lead">
                  <div className="cell-title">{s.name} {!s.active && <StatusBadge active={false} />}</div>
                  <div className="cell-sub">{[s.owner_name, s.phone].filter(Boolean).join(' · ') || '—'}</div>
                </td>
                <td data-label={t('shops.route')}><span className="badge">{routeName.get(s.route_id)}</span> <span className="muted">#{s.stop_seq}</span></td>
                <td data-label={t('shops.creditLimit')} className="num">{formatPaise(s.credit_limit_paise)} <span className="muted">· {t('shops.days', { n: s.credit_days })}</span></td>
                <td data-label={t('shops.login')}>{logins.data?.has(s.id)
                  ? <span className="badge badge-green"><CircleCheck size={12} aria-hidden="true" />{t('shops.hasLogin')}</span>
                  : <span className="badge">{t('shops.noLogin')}</span>}</td>
                <td className="actions">
                  {s.phone && <a className="button btn-sm" href={`tel:+91${s.phone}`} aria-label={`${t('shops.call')} ${s.name}`}><Phone size={16} aria-hidden="true" /></a>}
                  <button type="button" className="btn-sm" onClick={() => setEditing(s)}><Pencil size={16} aria-hidden="true" />{t('common.edit')}</button>
                </td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!editing} wide title={editing?.id ? editing.name : t('shops.add')} onClose={() => setEditing(null)}>
        {editing && routes.data && <ShopForm shop={editing} routes={routes.data} hasLogin={!!editing.id && !!logins.data?.has(editing.id)}
          onClose={(pin) => { setEditing(null); if (pin) setIssued([pin]) }} />}
      </Sheet>
      <Sheet open={importing} wide title={t('shops.importCsv')} onClose={() => setImporting(false)}>
        {importing && routes.data && <CsvImport routes={routes.data} onDone={(pins) => { setImporting(false); setIssued(pins) }} />}
      </Sheet>
      <PinIssued issued={issued} onDone={() => setIssued([])} />
    </section>
  )
}

function ShopForm({ shop, routes, hasLogin, onClose }: { shop: Partial<Shop>; routes: Route[]; hasLogin: boolean; onClose: (pin?: Issued) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [f, setF] = useState({
    name: shop.name ?? '', owner_name: shop.owner_name ?? '', phone: shop.phone ?? '', address: shop.address ?? '',
    gstin: shop.gstin ?? '', code: shop.code ?? '', route_id: shop.route_id ?? routes[0]?.id ?? '', stop_seq: String(shop.stop_seq ?? 0),
    credit_limit: String((shop.credit_limit_paise ?? 0) / 100), credit_days: String(shop.credit_days ?? 7), active: shop.active ?? true,
  })
  const [createLogin, setCreateLogin] = useState(!shop.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }))

  const limit = parseRupees(f.credit_limit)
  const phoneBad = !!f.phone && !PHONE.test(f.phone)
  const gstBad = !!f.gstin && !GSTIN.test(f.gstin)
  const valid = f.name.trim() && f.route_id && !phoneBad && !gstBad && limit !== null && limit >= 0
    && Number(f.credit_days) >= 0 && Number(f.credit_days) <= 90 && (!createLogin || hasLogin || PHONE.test(f.phone))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const row = {
        name: f.name.trim(), owner_name: f.owner_name.trim() || null, phone: f.phone || null, address: f.address.trim() || null,
        gstin: f.gstin || null, code: f.code.trim() || null, route_id: f.route_id, stop_seq: Number(f.stop_seq) || 0,
        credit_limit_paise: limit!, credit_days: Number(f.credit_days), active: f.active,
      }
      const [saved] = await must<Shop[]>(shop.id ? supabase.from('shop').update(row).eq('id', shop.id).select() : supabase.from('shop').insert(row).select())
      let pin: Issued | undefined
      if (createLogin && !hasLogin) {
        const res = await callFunction<{ pin: string }>('admin-users', { action: 'create', role: 'shop', name: f.owner_name.trim() || f.name.trim(), phone: f.phone, shop_id: saved.id })
        pin = { name: saved.name, phone: f.phone, pin: res.pin }
      }
      void qc.invalidateQueries({ queryKey: ['shop'] }); void qc.invalidateQueries({ queryKey: ['profiles'] })
      onClose(pin)
    } catch (err) { setError(errorMessage(t, err)) }
    finally { setBusy(false) }
  }

  return (
    <form className="stack-lg" onSubmit={save} noValidate>
      <div className="form-grid">
        <label className="field span-2"><span>{t('shops.name')} *</span><input maxLength={100} value={f.name} onChange={(e) => set('name')(e.target.value)} /></label>
        <label className="field"><span>{t('join.ownerName')}</span><input maxLength={100} value={f.owner_name} onChange={(e) => set('owner_name')(e.target.value)} /></label>
        <label className="field"><span>{t('users.phone')}</span>
          <input type="tel" inputMode="numeric" maxLength={10} aria-invalid={phoneBad} value={f.phone} onChange={(e) => set('phone')(e.target.value.replace(/\D/g, ''))} />
          {phoneBad && <span className="error hint">{t('errors.INVALID_PHONE')}</span>}</label>
        <label className="field span-2"><span>{t('join.address')}</span><textarea rows={2} maxLength={300} value={f.address} onChange={(e) => set('address')(e.target.value)} /></label>
      </div>
      <div className="form-grid">
        <label className="field"><span>{t('shops.route')} *</span>
          <select value={f.route_id} onChange={(e) => set('route_id')(e.target.value)}>
            {routes.filter((r) => r.active || r.id === f.route_id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select></label>
        <label className="field"><span>{t('shops.stopSeq')} <span className="hint">{t('shops.stopHint')}</span></span>
          <input type="number" inputMode="numeric" min={0} value={f.stop_seq} onChange={(e) => set('stop_seq')(e.target.value)} /></label>
        <label className="field"><span>{t('shops.creditLimit')} (₹)</span><input inputMode="decimal" value={f.credit_limit} onChange={(e) => set('credit_limit')(e.target.value)} /></label>
        <label className="field"><span>{t('shops.creditDays')}</span><input type="number" inputMode="numeric" min={0} max={90} value={f.credit_days} onChange={(e) => set('credit_days')(e.target.value)} /></label>
        <label className="field"><span>GSTIN <span className="hint">({t('common.optional')})</span></span>
          <input maxLength={15} aria-invalid={gstBad} value={f.gstin} onChange={(e) => set('gstin')(e.target.value.toUpperCase())} />
          {gstBad && <span className="error hint">{t('shops.gstinBad')}</span>}</label>
        <label className="field"><span>{t('shops.code')} <span className="hint">({t('common.optional')})</span></span><input maxLength={20} value={f.code} onChange={(e) => set('code')(e.target.value)} /></label>
      </div>
      <div className="stack" style={{ gap: 0 }}>
        <label className="chip"><input type="checkbox" checked={f.active} onChange={(e) => set('active')(e.target.checked)} />{t('shops.activeLabel')}</label>
        {hasLogin ? <p className="muted row"><CircleCheck size={16} aria-hidden="true" />{t('shops.loginExists')}</p>
          : <label className="chip"><input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} />{t('shops.createLogin')}</label>}
      </div>
      <Alert msg={error ? { kind: 'error', text: error } : null} />
      <div className="sheet-foot">
        <button type="button" onClick={() => onClose()}>{t('common.cancel')}</button>
        <button type="submit" className="primary" disabled={busy || !valid}>{busy ? t('common.loading') : t('common.save')}</button>
      </div>
    </form>
  )
}

interface CsvRow { line: number; data: Record<string, unknown>; error?: string }

function CsvImport({ routes, onDone }: { routes: Route[]; onDone: (pins: Issued[]) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [rows, setRows] = useState<CsvRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [withLogins, setWithLogins] = useState(true)
  const [progress, setProgress] = useState<string | null>(null)
  const [failures, setFailures] = useState<string[]>([])
  const byRoute = new Map(routes.map((r) => [r.name.toLowerCase().replace(/\s/g, ''), r.id]))

  const read = async (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    const recs = csvRecords(await file.text())
    const seen = new Set<string>()
    setRows(recs.map((r, i) => {
      const phone = (r.phone ?? '').replace(/\D/g, '').slice(-10)
      const routeId = byRoute.get((r.route ?? '').toLowerCase().replace(/\s/g, ''))
      const limit = r.credit_limit ? parseRupees(r.credit_limit) : 0
      const days = r.credit_days ? Number(r.credit_days) : 7
      const gstin = (r.gstin ?? '').toUpperCase()
      let error: string | undefined
      if (!(r.name ?? r.shop_name)) error = t('shops.csvErr.name')
      else if (!routeId) error = t('shops.csvErr.route', { route: r.route ?? '' })
      else if (phone && !PHONE.test(phone)) error = t('errors.INVALID_PHONE')
      else if (phone && seen.has(phone)) error = t('shops.csvErr.dupPhone')
      else if (limit === null || limit < 0) error = t('shops.csvErr.limit')
      else if (!Number.isInteger(days) || days < 0 || days > 90) error = t('shops.csvErr.days')
      else if (gstin && !GSTIN.test(gstin)) error = t('shops.gstinBad')
      if (phone) seen.add(phone)
      return { line: i + 2, error, data: {
        name: (r.name ?? r.shop_name ?? '').trim(), owner_name: r.owner_name || null, phone: phone || null,
        address: r.address || null, gstin: gstin || null, code: r.code || null, route_id: routeId,
        stop_seq: Number(r.stop_seq) || 0, credit_limit_paise: limit ?? 0, credit_days: days,
      } }
    }))
  }

  const run = async () => {
    if (!rows) return
    const good = rows.filter((r) => !r.error)
    const pins: Issued[] = []
    const fails: string[] = []
    try {
      setProgress(t('shops.savingShops', { n: good.length }))
      const saved = await must<Shop[]>(supabase.from('shop').insert(good.map((r) => r.data)).select())
      if (withLogins) {
        let i = 0
        for (const s of saved) {
          i++
          if (!s.phone) continue
          setProgress(t('shops.creatingLogins', { i, n: saved.length }))
          try {
            const res = await callFunction<{ pin: string }>('admin-users', { action: 'create', role: 'shop', name: s.owner_name || s.name, phone: s.phone, shop_id: s.id })
            pins.push({ name: s.name, phone: s.phone, pin: res.pin })
          } catch (err) { fails.push(`${s.name}: ${errorMessage(t, err)}`) }
        }
      }
    } catch (err) { fails.push(errorMessage(t, err)) }
    setProgress(null); setFailures(fails)
    void qc.invalidateQueries({ queryKey: ['shop'] }); void qc.invalidateQueries({ queryKey: ['profiles'] })
    if (!fails.length || pins.length) onDone(pins)
  }

  const template = () => downloadText('shops-template.csv',
    toCsv([['name', 'owner_name', 'phone', 'route', 'stop_seq', 'credit_limit', 'credit_days', 'address', 'gstin', 'code'],
      ['Sharma General Store', 'Ramesh Sharma', '9876543210', routes[0]?.name ?? 'Mon/Thu', 1, 5000, 7, 'Main Bazar', '', 'S001']]))

  const bad = rows?.filter((r) => r.error) ?? []
  const ok = (rows?.length ?? 0) - bad.length
  return (
    <div className="stack-lg">
      <ol className="stack" style={{ paddingLeft: 20, margin: 0 }}>
        <li>{t('shops.step1')} <button type="button" className="ghost btn-sm" onClick={template}><Download size={16} aria-hidden="true" />{t('shops.downloadTemplate')}</button></li>
        <li>{t('shops.step2', { routes: routes.map((r) => r.name).join(', ') })}</li>
        <li>{t('shops.step3')}</li>
      </ol>
      <label className="button btn-block" style={{ borderStyle: 'dashed', minHeight: 72 }}>
        <FileSpreadsheet size={20} aria-hidden="true" />{fileName || t('prices.chooseFile')}
        <input type="file" accept=".csv,text/csv" onChange={(e) => void read(e.target.files?.[0])} />
      </label>
      {rows && (
        <div className="stack">
          <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="stat"><div className="label">{t('shops.ready')}</div><div className="value" style={{ color: 'var(--brand-700)' }}>{ok}</div></div>
            <div className="stat"><div className="label">{t('shops.withErrors')}</div><div className="value" style={{ color: bad.length ? 'var(--danger)' : undefined }}>{bad.length}</div></div>
          </div>
          {bad.length > 0 && <div className="alert alert-error"><ul className="plain-list">{bad.slice(0, 15).map((r) => <li key={r.line}>{t('shops.line', { n: r.line })}: {r.error}</li>)}</ul></div>}
          <label className="chip"><input type="checkbox" checked={withLogins} onChange={(e) => setWithLogins(e.target.checked)} />{t('shops.createLogins')}</label>
        </div>
      )}
      {failures.length > 0 && <div className="alert alert-error" role="alert"><ul className="plain-list">{failures.map((f) => <li key={f}>{f}</li>)}</ul></div>}
      <div className="sheet-foot">
        <button type="button" className="primary" disabled={!!progress || !ok} onClick={() => void run()}>{progress ?? t('shops.importN', { n: ok })}</button>
      </div>
    </div>
  )
}
