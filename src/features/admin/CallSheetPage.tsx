import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Check, MessageCircle, Phone, PhoneCall, PhoneMissed, Clock, Plus, RotateCcw, Search, ShoppingCart, ShoppingBag } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise } from '../../shared/money'
import { Alert, Empty, PageHeader, Sheet, Skeleton } from '../../shared/ui/kit'
import { todayIST } from './opsData'

type CallStatus = 'pending' | 'called' | 'order_taken' | 'no_answer' | 'callback'

interface RouteInfo {
  id: string
  name: string
  visit_days: number[] | null
  default_vehicle: string | null
}

interface SheetShop {
  id: string
  sheet_name: string
  route_id: string | null
  sr_no: number | null
  sort_order: number
  source: 'excel' | 'manual' | 'db_extra'
  shop_id: string | null
  r_no: string | null
  beat: string | null
  mkt: string | null
  outlet_name: string
  address: string | null
  location: string | null
  contact_name: string | null
  phone: string | null
  visi_info: string | null
}

interface CallLog {
  id: string
  sheet_shop_id: string
  call_date: string
  status: CallStatus
  note: string | null
  called_by_name: string | null
  called_at: string
}

interface PurchaseItem {
  qty: number
  name: string
}

interface ShopLastPurchase {
  shop_id: string
  created_at: string
  total_paise: number
  purchase_type: 'bill' | 'order' | 'invoice'
  items: PurchaseItem[] | null
}

const SHEET_ORDER = ['ROUTE 1A', 'ROUTE1B', 'ROUTE1C', 'ROUTE1D', 'ROUTE1E', 'ROUTE2A', 'ROUTE2B', 'ROUTE2C', 'ROUTE3A']

const SHEET_AREA_FALLBACK: Record<string, string> = {
  'ROUTE 1A': 'Shanti Nagar',
  'ROUTE1B': 'Ram Nagar',
  'ROUTE1C': 'Supela',
  'ROUTE1D': 'Camp 1',
  'ROUTE1E': 'Housing Board',
  'ROUTE2A': 'Bhilai 3',
  'ROUTE2B': 'Charoda',
  'ROUTE2C': 'Kumhari',
  'ROUTE3A': 'Camp 2',
}

function getAreaName(sheetName: string, routeName?: string | null): string {
  if (routeName) {
    const parts = routeName.split('·')
    if (parts.length > 1) return parts.slice(1).join('·').trim()
    return routeName
  }
  return SHEET_AREA_FALLBACK[sheetName] ?? sheetName
}

const STATUS_META: Record<CallStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: 'To call', bg: '#f1f5f9', fg: '#475569' },
  order_taken: { label: 'Order taken', bg: '#dcfce7', fg: '#166534' },
  called: { label: 'Called', bg: '#dbeafe', fg: '#1e40af' },
  no_answer: { label: 'No answer', bg: '#fee2e2', fg: '#991b1b' },
  callback: { label: 'Call back', bg: '#fef3c7', fg: '#92400e' },
}

const cleanPhone = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10)

function isoDow(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function fmtShortDate(iso: string) {
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

function formatPurchaseAgo(isoDate: string, todayStr: string): { label: string; dateStr: string; diffDays: number } {
  try {
    const dStr = isoDate.slice(0, 10)
    const dBuy = new Date(`${dStr}T00:00:00Z`)
    const dToday = new Date(`${todayStr}T00:00:00Z`)
    const diffDays = Math.round((dToday.getTime() - dBuy.getTime()) / (1000 * 60 * 60 * 24))
    const formatted = new Date(`${dStr}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })

    if (diffDays <= 0) return { label: 'Today', dateStr: formatted, diffDays: 0 }
    if (diffDays === 1) return { label: 'Yesterday', dateStr: formatted, diffDays: 1 }
    if (diffDays < 7) return { label: `${diffDays}d ago`, dateStr: formatted, diffDays }
    if (diffDays < 14) return { label: '1w ago', dateStr: formatted, diffDays }
    if (diffDays < 30) return { label: `${Math.floor(diffDays / 7)}w ago`, dateStr: formatted, diffDays }
    return { label: `${Math.floor(diffDays / 30)}mo ago`, dateStr: formatted, diffDays }
  } catch {
    return { label: isoDate.slice(0, 10), dateStr: '', diffDays: 999 }
  }
}

function formatPitchSummary(items: PurchaseItem[]): string {
  if (!items || items.length === 0) return ''
  const sorted = [...items].sort((a, b) => b.qty - a.qty)
  if (sorted.length === 1) {
    return `${sorted[0].qty} case ${sorted[0].name}`
  }
  if (sorted.length === 2) {
    return `${sorted[0].qty} case ${sorted[0].name} aur ${sorted[1].qty} case ${sorted[1].name}`
  }
  return `${sorted[0].qty} case ${sorted[0].name}, ${sorted[1].qty} case ${sorted[1].name} aur anya`
}

export default function CallSheetPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const today = todayIST()
  const [callDate, setCallDate] = useState(today)
  const [sheet, setSheet] = useState<string>('')
  const [q, setQ] = useState('')
  const [mktFilter, setMktFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | CallStatus | 'extra' | 'followup'>('all')
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [newShop, setNewShop] = useState({ outlet_name: '', contact_name: '', phone: '', address: '', location: '', mkt: '' })
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const routesQ = useQuery({
    queryKey: ['routes', 'call_sheet'],
    queryFn: () => must<RouteInfo[]>(supabase.from('route').select('id, name, visit_days, default_vehicle').order('name')),
  })

  const shopsQ = useQuery({
    queryKey: ['route_sheet_shop'],
    queryFn: () => must<SheetShop[]>(
      supabase.from('route_sheet_shop')
        .select('id, sheet_name, route_id, sr_no, sort_order, source, shop_id, r_no, beat, mkt, outlet_name, address, location, contact_name, phone, visi_info')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .range(0, 1999)
    ),
  })

  const logsQ = useQuery({
    queryKey: ['route_call_log', callDate],
    queryFn: () => must<CallLog[]>(
      supabase.from('route_call_log')
        .select('id, sheet_shop_id, call_date, status, note, called_by_name, called_at')
        .eq('call_date', callDate)
    ),
  })

  const prevLogsQ = useQuery({
    queryKey: ['route_call_log_prev', callDate],
    queryFn: () => must<Pick<CallLog, 'sheet_shop_id' | 'call_date' | 'status' | 'note'>[]>(
      supabase.from('route_call_log')
        .select('sheet_shop_id, call_date, status, note')
        .lt('call_date', callDate)
        .order('call_date', { ascending: false })
        .range(0, 1999)
    ),
  })

  const balancesQ = useQuery({
    queryKey: ['call_sheet_balances'],
    queryFn: () => must<{ shop_id: string; balance_paise: number; overdue_paise: number }[]>(
      supabase.from('v_shop_balance').select('shop_id, balance_paise, overdue_paise')
    ),
  })

  const lastPurchasesQ = useQuery({
    queryKey: ['call_sheet_last_purchases'],
    queryFn: () => must<ShopLastPurchase[]>(
      supabase.from('v_shop_last_purchase').select('shop_id, created_at, total_paise, purchase_type, items')
    ),
  })

  const routeById = useMemo(() => new Map((routesQ.data ?? []).map((r) => [r.id, r])), [routesQ.data])
  const dow = isoDow(callDate)

  const sheets = useMemo(() => {
    const bySheet = new Map<string, SheetShop[]>()
    for (const s of shopsQ.data ?? []) {
      const arr = bySheet.get(s.sheet_name) ?? []
      arr.push(s)
      bySheet.set(s.sheet_name, arr)
    }
    const keys = [...bySheet.keys()].sort((a, b) => {
      const ia = SHEET_ORDER.indexOf(a), ib = SHEET_ORDER.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    })
    return keys.map((name) => {
      const items = bySheet.get(name) ?? []
      const rid = items[0]?.route_id ?? null
      const route = rid ? routeById.get(rid) : undefined
      const areaName = getAreaName(name, route?.name)
      const schedule = route?.name?.split('·')[0]?.trim() ?? ''
      const isToday = !!(route?.visit_days && route.visit_days.includes(dow))
      return { name, items, route, areaName, schedule, isToday }
    })
  }, [shopsQ.data, routeById, dow])

  useEffect(() => {
    if (!sheet && sheets.length) {
      const firstToday = sheets.find((s) => s.isToday)
      setSheet((firstToday ?? sheets[0]).name)
    }
  }, [sheets, sheet])

  const activeSheet = sheets.find((s) => s.name === sheet) ?? sheets[0]

  const logByShop = useMemo(() => new Map((logsQ.data ?? []).map((l) => [l.sheet_shop_id, l])), [logsQ.data])

  const prevLogByShop = useMemo(() => {
    const m = new Map<string, Pick<CallLog, 'sheet_shop_id' | 'call_date' | 'status' | 'note'>>()
    for (const l of prevLogsQ.data ?? []) {
      if (!m.has(l.sheet_shop_id)) m.set(l.sheet_shop_id, l)
    }
    return m
  }, [prevLogsQ.data])

  const balanceByShop = useMemo(
    () => new Map((balancesQ.data ?? []).map((b) => [b.shop_id, b])),
    [balancesQ.data],
  )

  const lastPurchaseByShop = useMemo(
    () => new Map((lastPurchasesQ.data ?? []).map((p) => [p.shop_id, p])),
    [lastPurchasesQ.data],
  )

  const markets = useMemo(() => {
    const set = new Set<string>()
    for (const s of activeSheet?.items ?? []) {
      if (s.mkt?.trim()) set.add(s.mkt.trim())
    }
    return [...set].sort()
  }, [activeSheet])

  const stats = useMemo(() => {
    const items = activeSheet?.items ?? []
    const counts = { total: items.length, pending: 0, order_taken: 0, called: 0, no_answer: 0, callback: 0, extra: 0, followup: 0 }
    for (const s of items) {
      if (s.source !== 'excel') counts.extra++
      const st = logByShop.get(s.id)?.status ?? 'pending'
      counts[st]++
      const prev = prevLogByShop.get(s.id)
      if (st === 'pending' && prev && (prev.status === 'callback' || prev.status === 'no_answer')) counts.followup++
    }
    return counts
  }, [activeSheet, logByShop, prevLogByShop])

  const isSearching = q.trim().length > 0

  const sheetAreaByName = useMemo(
    () => new Map(sheets.map((s) => [s.name, s.areaName])),
    [sheets],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const sourceItems = needle ? (shopsQ.data ?? []) : (activeSheet?.items ?? [])
    return sourceItems.filter((s) => {
      const st = logByShop.get(s.id)?.status ?? 'pending'
      const prev = prevLogByShop.get(s.id)
      if (statusFilter === 'extra' && s.source === 'excel') return false
      if (statusFilter === 'followup' && !(st === 'pending' && prev && (prev.status === 'callback' || prev.status === 'no_answer'))) return false
      if (statusFilter !== 'all' && statusFilter !== 'extra' && statusFilter !== 'followup' && st !== statusFilter) return false
      if (!needle && mktFilter && (s.mkt ?? '').trim() !== mktFilter) return false
      if (!needle) return true
      const areaName = sheetAreaByName.get(s.sheet_name) ?? ''
      const pur = s.shop_id ? lastPurchaseByShop.get(s.shop_id) : undefined
      const purWords = (pur?.items ?? []).map((it) => `${it.qty} ${it.name}`).join(' ')
      return [s.outlet_name, s.contact_name, s.phone, s.address, s.location, s.mkt, areaName, s.sheet_name, s.sr_no ? String(s.sr_no) : '', purWords]
        .some((v) => (v ?? '').toLowerCase().includes(needle))
    })
  }, [activeSheet, shopsQ.data, sheetAreaByName, logByShop, prevLogByShop, lastPurchaseByShop, statusFilter, mktFilter, q])

  const upsertCall = useMutation({
    mutationFn: async ({ shopId, status, note }: { shopId: string; status: CallStatus; note?: string }) => {
      const existing = logByShop.get(shopId)
      const nextNote = note !== undefined ? note : (existing?.note ?? null)
      if (status === 'pending' && !nextNote) {
        await must(supabase.from('route_call_log').delete().eq('sheet_shop_id', shopId).eq('call_date', callDate))
        return
      }
      await must(supabase.from('route_call_log').upsert({
        sheet_shop_id: shopId,
        call_date: callDate,
        status,
        note: nextNote,
        called_by: profile?.user_id ?? null,
        called_by_name: profile?.name ?? null,
        called_at: new Date().toISOString(),
      }, { onConflict: 'sheet_shop_id,call_date' }))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['route_call_log', callDate] }),
    onError: (e: Error) => setMsg({ kind: 'error', text: e.message }),
  })

  const addManual = useMutation({
    mutationFn: async () => {
      if (!activeSheet || !newShop.outlet_name.trim()) throw new Error('Outlet name is required')
      const maxSort = Math.max(10000, ...activeSheet.items.map((x) => x.sort_order))
      await must(supabase.from('route_sheet_shop').insert({
        sheet_name: activeSheet.name,
        route_id: activeSheet.route?.id ?? null,
        sr_no: null,
        sort_order: maxSort + 1,
        source: 'manual',
        mkt: newShop.mkt.trim() || null,
        outlet_name: newShop.outlet_name.trim(),
        address: newShop.address.trim() || null,
        location: newShop.location.trim() || null,
        contact_name: newShop.contact_name.trim() || null,
        phone: newShop.phone.trim() || null,
        active: true,
      }))
    },
    onSuccess: () => {
      setAddOpen(false)
      setNewShop({ outlet_name: '', contact_name: '', phone: '', address: '', location: '', mkt: '' })
      setMsg({ kind: 'success', text: `Added shop to end of ${activeSheet?.name}` })
      qc.invalidateQueries({ queryKey: ['route_sheet_shop'] })
    },
    onError: (e: Error) => setMsg({ kind: 'error', text: e.message }),
  })

  const doneCount = stats.order_taken + stats.called + stats.no_answer + stats.callback
  const donePct = stats.total ? Math.round((doneCount / stats.total) * 100) : 0
  const strikePct = doneCount ? Math.round((stats.order_taken / doneCount) * 100) : 0

  return (
    <section className="stack-lg">
      <PageHeader
        title="Route Call Sheet"
        sub="Exact Excel route sheets (plus extra added shops at the end). Tap Call as the vehicle goes out."
        actions={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input
              type="date"
              className="input"
              value={callDate}
              max={today}
              onChange={(e) => setCallDate(e.target.value)}
              aria-label="Call date"
            />
            <button type="button" onClick={() => setAddOpen(true)} disabled={!activeSheet}>
              <Plus size={16} aria-hidden="true" /> Add shop
            </button>
          </div>
        }
      />

      {msg && <Alert msg={msg} />}
      {shopsQ.isError && <Alert msg={{ kind: 'error', text: 'Failed to load route call sheet.' }} />}
      {shopsQ.isLoading && <Skeleton rows={8} />}

      {!shopsQ.isLoading && sheets.length > 0 && <>
        <div
          className="row"
          style={{
            gap: 8,
            overflowX: 'auto',
            flexWrap: 'nowrap',
            paddingBottom: 6,
            WebkitOverflowScrolling: 'touch',
            maxWidth: '100%',
            width: '100%',
            boxSizing: 'border-box',
          }}
          role="tablist"
          aria-label="Route sheets"
        >
          {sheets.map((s) => {
            const active = s.name === activeSheet?.name
            return (
              <button
                key={s.name}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setSheet(s.name); setMktFilter(''); setStatusFilter('all') }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: active ? '2px solid #16a34a' : '1px solid #cbd5e1',
                  background: active ? '#f0fdf4' : '#ffffff',
                  color: '#0f172a',
                  textAlign: 'left',
                  cursor: 'pointer',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <strong>{s.areaName}</strong>
                  <span className="cell-sub">({s.items.length})</span>
                  {s.isToday && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#16a34a', color: '#fff' }}>
                      TODAY
                    </span>
                  )}
                </div>
                <div className="cell-sub" style={{ fontSize: 11 }}>
                  {[s.schedule, s.name].filter(Boolean).join(' · ')}
                </div>
              </button>
            )
          })}
        </div>

        {activeSheet && (
          <div className="card stack" style={{ gap: 10 }}>
            <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div>
                {isSearching ? (
                  <>
                    <h2 style={{ margin: 0, fontSize: 17 }}>
                      All Routes Search <span className="cell-sub" style={{ fontWeight: 500, fontSize: 13 }}>({filtered.length} matching shops)</span>
                    </h2>
                    <div className="cell-sub">
                      Searching across all {shopsQ.data?.length ?? 0} shops ·{' '}
                      <button type="button" className="btn-sm" style={{ padding: '1px 6px', fontSize: 11 }} onClick={() => setQ('')}>
                        Clear search
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 style={{ margin: 0, fontSize: 17 }}>
                      {activeSheet.areaName} <span className="cell-sub" style={{ fontWeight: 500, fontSize: 13 }}>({activeSheet.name}{activeSheet.schedule ? ` · ${activeSheet.schedule}` : ''})</span>
                    </h2>
                    <div className="cell-sub">
                      {doneCount} of {stats.total} contacted ({donePct}%) · {stats.order_taken} orders ({strikePct}% conv) · {stats.called} called · {stats.no_answer} no ans · {stats.callback} callback
                    </div>
                  </>
                )}
              </div>
              {!isSearching && (
                <div style={{ minWidth: 160, flex: '0 1 220px' }}>
                  <div style={{ height: 8, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${donePct}%`, height: '100%', background: '#16a34a', transition: 'width .2s' }} />
                  </div>
                </div>
              )}
            </div>

            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 340 }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#64748b' }} aria-hidden="true" />
                <input
                  className="input"
                  style={{ paddingLeft: 32, width: '100%' }}
                  placeholder="Search all shops, contact, phone, area..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              {!isSearching && markets.length > 0 && (
                <select className="input" value={mktFilter} onChange={(e) => setMktFilter(e.target.value)} aria-label="Filter by market">
                  <option value="">All markets ({markets.length})</option>
                  {markets.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
              <div className="segmented" style={{ flexWrap: 'wrap' }}>
                {([
                  ['all', `All (${stats.total})`],
                  ['pending', `To call (${stats.pending})`],
                  ['followup', `Follow-up (${stats.followup})`],
                  ['order_taken', `Order (${stats.order_taken})`],
                  ['called', `Called (${stats.called})`],
                  ['no_answer', `No ans (${stats.no_answer})`],
                  ['callback', `Callback (${stats.callback})`],
                  ['extra', `Extra (${stats.extra})`],
                ] as const).map(([k, lbl]) => (
                  <button key={k} type="button" className="btn-sm" aria-pressed={statusFilter === k} onClick={() => setStatusFilter(k)}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <Empty icon={<Phone size={24} />} title="No shops match this filter" />
            ) : (
              <div className="table-wrap">
                <table className="dense table-stack" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: 44 }}>S.R.</th>
                      <th scope="col">Shop &amp; Address</th>
                      <th scope="col" style={{ width: 190 }}>Call</th>
                      <th scope="col">Status ({callDate === today ? 'Today' : callDate}) &amp; Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => {
                      const log = logByShop.get(s.id)
                      const prev = prevLogByShop.get(s.id)
                      const bal = s.shop_id ? balanceByShop.get(s.shop_id) : undefined
                      const pur = s.shop_id ? lastPurchaseByShop.get(s.shop_id) : undefined
                      const purAgo = pur ? formatPurchaseAgo(pur.created_at, today) : undefined
                      const pitchItems = pur?.items?.length ? formatPitchSummary(pur.items) : ''
                      const st: CallStatus = log?.status ?? 'pending'
                      const meta = STATUS_META[st]
                      const phone10 = cleanPhone(s.phone)
                      const draft = noteDrafts[s.id] ?? (log?.note ?? '')
                      const areaBits = [s.address, s.location, s.mkt].filter(Boolean).join(' · ')
                      return (
                        <tr key={s.id} style={{ background: st === 'order_taken' ? '#f0fdf4' : undefined }}>
                          <td className="num" data-label="S.R.">
                            {s.source === 'excel' ? (
                              <b>{s.sr_no ?? s.sort_order}</b>
                            ) : (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 6, background: '#e0e7ff', color: '#3730a3' }}>
                                EXTRA
                              </span>
                            )}
                          </td>
                          <td className="lead" data-label="Shop" style={{ maxWidth: '100%', minWidth: 0, overflowWrap: 'anywhere' }}>
                            <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              <b style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{s.outlet_name}</b>
                              {bal && bal.balance_paise > 0 && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: 99,
                                    background: bal.overdue_paise > 0 ? '#fee2e2' : '#fef3c7',
                                    color: bal.overdue_paise > 0 ? '#991b1b' : '#92400e',
                                  }}
                                >
                                  Due {formatPaise(bal.balance_paise)}
                                </span>
                              )}
                              {isSearching && (
                                <button
                                  type="button"
                                  onClick={() => { setSheet(s.sheet_name); setQ(''); setMktFilter('') }}
                                  title={`Open ${sheetAreaByName.get(s.sheet_name) ?? s.sheet_name}`}
                                  style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#e2e8f0', color: '#0f172a', border: 'none', cursor: 'pointer' }}
                                >
                                  {sheetAreaByName.get(s.sheet_name) ?? s.sheet_name}
                                </button>
                              )}
                            </div>
                            {areaBits && <div className="cell-sub" style={{ marginTop: 2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{areaBits}</div>}

                            {/* LAST PURCHASE & CALLING TALK-TRACK */}
                            {pur && pur.items && pur.items.length > 0 && purAgo ? (
                              <div
                                style={{
                                  marginTop: 7,
                                  padding: '8px 10px',
                                  borderRadius: 8,
                                  background: '#f0fdfa',
                                  border: '1px solid #a7f3d0',
                                  fontSize: 12,
                                  maxWidth: '100%',
                                  boxSizing: 'border-box',
                                  overflowWrap: 'anywhere',
                                  wordBreak: 'break-word',
                                }}
                              >
                                <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      fontWeight: 700,
                                      fontSize: 11,
                                      color: '#065f46',
                                      background: '#d1fae5',
                                      padding: '2px 7px',
                                      borderRadius: 99,
                                    }}
                                  >
                                    <ShoppingBag size={11} aria-hidden="true" />
                                    Last bought: {purAgo.label} ({purAgo.dateStr})
                                  </span>
                                  {pur.total_paise > 0 && (
                                    <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 11 }}>
                                      {formatPaise(pur.total_paise)}
                                    </span>
                                  )}
                                  <span style={{ fontSize: 10, color: '#059669', opacity: 0.85 }}>
                                    • {pur.purchase_type === 'order' ? 'App Order' : 'Truck / Van'}
                                  </span>
                                </div>

                                <div style={{ color: '#1e293b', fontWeight: 600, fontSize: 12, lineHeight: 1.35, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                  🛒 {pur.items.map((it) => `${it.qty}× ${it.name}`).join(' · ')}
                                </div>

                                {pitchItems && (
                                  <button
                                    type="button"
                                    onClick={() => setNoteDrafts((d) => ({
                                      ...d,
                                      [s.id]: draft ? `${draft} · Refill ${pitchItems}?` : `Refill: ${pitchItems}?`
                                    }))}
                                    title="Click to insert talk-track into remark note"
                                    style={{
                                      marginTop: 5,
                                      paddingTop: 5,
                                      border: 0,
                                      borderTop: '1px dashed #6ee7b7',
                                      background: 'transparent',
                                      color: '#047857',
                                      fontSize: 11,
                                      lineHeight: 1.4,
                                      textAlign: 'left',
                                      cursor: 'pointer',
                                      padding: '5px 0 0 0',
                                      display: 'block',
                                      width: '100%',
                                      maxWidth: '100%',
                                      boxSizing: 'border-box',
                                      whiteSpace: 'normal',
                                      wordBreak: 'break-word',
                                      overflowWrap: 'anywhere',
                                    }}
                                  >
                                    🗣️ <strong>Say on call:</strong> &ldquo;Bhaiya, {purAgo.label === 'Today' || purAgo.label === 'Yesterday' ? purAgo.label.toLowerCase() : purAgo.dateStr} ko <strong>{pitchItems}</strong> liya tha — refill bhejein?&rdquo;
                                    <span style={{ fontSize: 10, color: '#059669', textDecoration: 'underline', marginLeft: 6, fontWeight: 500 }}>
                                      (tap to note)
                                    </span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div
                                style={{
                                  marginTop: 5,
                                  fontSize: 11,
                                  color: '#64748b',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  background: '#f8fafc',
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  border: '1px dashed #cbd5e1',
                                  maxWidth: '100%',
                                  boxSizing: 'border-box',
                                  whiteSpace: 'normal',
                                  wordBreak: 'break-word',
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                <span>🆕 No past orders in app · Pitch starter pack (Dew/Sting/Aquafina)</span>
                              </div>
                            )}
                          </td>
                          <td data-label="Call" style={{ maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                            {s.contact_name && <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, color: '#334155', wordBreak: 'break-word' }}>👤 {s.contact_name}</div>}
                            <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              {phone10 ? (
                                <>
                                  <a
                                    href={`tel:+91${phone10}`}
                                    className="btn-sm"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      background: '#16a34a',
                                      color: '#fff',
                                      textDecoration: 'none',
                                      padding: '6px 10px',
                                      borderRadius: 7,
                                      fontWeight: 700,
                                      fontSize: 12,
                                      boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
                                    }}
                                  >
                                    <Phone size={13} aria-hidden="true" /> {phone10}
                                  </a>
                                  <a
                                    href={`https://wa.me/91${phone10}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn-sm"
                                    title="WhatsApp"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 3,
                                      background: '#ecfdf5',
                                      color: '#166534',
                                      border: '1px solid #bbf7d0',
                                      textDecoration: 'none',
                                      padding: '6px 9px',
                                      borderRadius: 7,
                                      fontWeight: 600,
                                      fontSize: 12
                                    }}
                                  >
                                    <MessageCircle size={13} aria-hidden="true" /> WA
                                  </a>
                                </>
                              ) : (
                                <span className="cell-sub">No phone</span>
                              )}
                              {s.shop_id && (
                                <button
                                  type="button"
                                  className="btn-sm"
                                  title="Create order for this shop"
                                  onClick={() => navigate(`/admin/orders?shopId=${s.shop_id}`)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    background: '#f0fdf4',
                                    color: '#15803d',
                                    border: '1px solid #86efac',
                                    padding: '6px 9px',
                                    borderRadius: 7,
                                    fontWeight: 600,
                                    fontSize: 12
                                  }}
                                >
                                  <ShoppingCart size={13} aria-hidden="true" /> + Order
                                </button>
                              )}
                            </div>
                          </td>
                          <td data-label="Status & Note" style={{ maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                            <div className="row" style={{ gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 5 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: meta.bg, color: meta.fg }}>
                                {meta.label}
                              </span>
                              {log?.called_at && (
                                <span className="cell-sub" style={{ fontSize: 11, wordBreak: 'break-word' }}>
                                  {fmtTime(log.called_at)}{log.called_by_name ? ` · ${log.called_by_name}` : ''}
                                </span>
                              )}
                            </div>
                            <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                              <button
                                type="button"
                                className="btn-sm"
                                title="Order taken"
                                aria-pressed={st === 'order_taken'}
                                style={st === 'order_taken' ? { background: '#16a34a', color: '#fff', borderColor: '#15803d', fontWeight: 700 } : undefined}
                                onClick={() => upsertCall.mutate({ shopId: s.id, status: 'order_taken' })}
                              >
                                <Check size={12} aria-hidden="true" /> Order
                              </button>
                              <button
                                type="button"
                                className="btn-sm"
                                title="Called"
                                aria-pressed={st === 'called'}
                                style={st === 'called' ? { background: '#2563eb', color: '#fff', borderColor: '#1d4ed8', fontWeight: 700 } : undefined}
                                onClick={() => upsertCall.mutate({ shopId: s.id, status: 'called' })}
                              >
                                <PhoneCall size={12} aria-hidden="true" /> Called
                              </button>
                              <button
                                type="button"
                                className="btn-sm"
                                title="No answer"
                                aria-pressed={st === 'no_answer'}
                                style={st === 'no_answer' ? { background: '#dc2626', color: '#fff', borderColor: '#b91c1c', fontWeight: 700 } : undefined}
                                onClick={() => upsertCall.mutate({ shopId: s.id, status: 'no_answer' })}
                              >
                                <PhoneMissed size={12} aria-hidden="true" /> No ans
                              </button>
                              <button
                                type="button"
                                className="btn-sm"
                                title="Call back"
                                aria-pressed={st === 'callback'}
                                style={st === 'callback' ? { background: '#d97706', color: '#fff', borderColor: '#b45309', fontWeight: 700 } : undefined}
                                onClick={() => upsertCall.mutate({ shopId: s.id, status: 'callback' })}
                              >
                                <Clock size={12} aria-hidden="true" /> Later
                              </button>
                              {st !== 'pending' && (
                                <button
                                  type="button"
                                  className="btn-sm"
                                  title="Reset"
                                  onClick={() => upsertCall.mutate({ shopId: s.id, status: 'pending', note: '' })}
                                >
                                  <RotateCcw size={12} aria-hidden="true" />
                                </button>
                              )}
                            </div>
                            <input
                              className="input"
                              style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', fontSize: 13, padding: '5px 8px', borderRadius: 7 }}
                              placeholder="Remark / order note..."
                              value={draft}
                              onChange={(e) => setNoteDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                              onBlur={() => {
                                if (draft !== (log?.note ?? '')) {
                                  upsertCall.mutate({ shopId: s.id, status: st === 'pending' && draft.trim() ? 'called' : st, note: draft.trim() })
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                              }}
                            />
                            {prev && (
                              <div className="cell-sub" style={{ fontSize: 11, marginTop: 4, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                Last ({fmtShortDate(prev.call_date)}): {STATUS_META[prev.status]?.label ?? prev.status}
                                {prev.note ? ` · "${prev.note}"` : ''}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </>}

      <Sheet open={addOpen} title={`Add shop to ${activeSheet?.name ?? ''}`} onClose={() => setAddOpen(false)}>
        <form
          className="stack"
          style={{ gap: 10 }}
          onSubmit={(e) => { e.preventDefault(); addManual.mutate() }}
        >
          <label className="stack" style={{ gap: 3 }}>
            <span className="cell-sub">Outlet name *</span>
            <input className="input" required value={newShop.outlet_name} onChange={(e) => setNewShop({ ...newShop, outlet_name: e.target.value })} />
          </label>
          <label className="stack" style={{ gap: 3 }}>
            <span className="cell-sub">Contact person</span>
            <input className="input" value={newShop.contact_name} onChange={(e) => setNewShop({ ...newShop, contact_name: e.target.value })} />
          </label>
          <label className="stack" style={{ gap: 3 }}>
            <span className="cell-sub">Phone</span>
            <input className="input" type="tel" value={newShop.phone} onChange={(e) => setNewShop({ ...newShop, phone: e.target.value })} />
          </label>
          <label className="stack" style={{ gap: 3 }}>
            <span className="cell-sub">Address</span>
            <input className="input" value={newShop.address} onChange={(e) => setNewShop({ ...newShop, address: e.target.value })} />
          </label>
          <label className="stack" style={{ gap: 3 }}>
            <span className="cell-sub">Location / Area</span>
            <input className="input" value={newShop.location} onChange={(e) => setNewShop({ ...newShop, location: e.target.value })} />
          </label>
          <label className="stack" style={{ gap: 3 }}>
            <span className="cell-sub">Market (MKT)</span>
            <input className="input" value={newShop.mkt} onChange={(e) => setNewShop({ ...newShop, mkt: e.target.value })} />
          </label>
          <button type="submit" disabled={addManual.isPending}>
            {addManual.isPending ? 'Saving...' : 'Add to end of sheet'}
          </button>
        </form>
      </Sheet>
    </section>
  )
}
