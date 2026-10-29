import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../shared/api/supabase'
import { must, type Pack, type PriceListItem, type Variant } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { listQueue, loadSnapshot, onQueueChange, saveSnapshot, syncQueue, type QueuedAction } from './offline'

export interface DShop { id: string; name: string; owner_name: string | null; phone: string | null; address: string | null; stop_seq: number; route_id: string }
export interface DOrder { id: string; shop_id: string; status: string; order_line: { variant_id: string; qty_ordered: number; unit_price_paise: number }[] }
export interface DInvoice { id: string; number: string; shop_id: string; total_paise: number; created_at: string; delivery_line: { variant_id: string; qty_delivered: number; unit_price_paise: number }[] }
export interface DPlan { id: string; route_id: string; date: string; status: string; route: { name: string }; vehicle: { name: string } | null }
export interface Snapshot {
  plan: DPlan | null
  shops: DShop[]
  orders: DOrder[]
  load: { variant_id: string; qty_ordered_total: number; qty_spare: number }[]
  invoices: DInvoice[]
  balances: Record<string, number>
  payments: { shop_id: string; amount_paise: number; payment_mode: 'cash' | 'upi' }[]
  catalog: { variant: Variant; pack: Pack; price: PriceListItem | null }[]
}

async function fetchSnapshot(): Promise<Snapshot> {
  const plans = await must<DPlan[]>(supabase.from('route_day_plan').select('id, route_id, date, status, route(name), vehicle(name)').in('status', ['loaded', 'out']).order('date', { ascending: false }).limit(1))
  const plan = plans[0] ?? null
  const [shops, packs, variants, prices] = await Promise.all([
    must<DShop[]>(supabase.from('shop').select('id, name, owner_name, phone, address, stop_seq, route_id').eq('active', true).order('stop_seq')),
    must<Pack[]>(supabase.from('pack').select('*')),
    must<Variant[]>(supabase.from('variant').select('*')),
    must<PriceListItem[]>(supabase.from('price_list_item').select('*, price_list!inner(status)').eq('price_list.status', 'active')),
  ])
  const pk = new Map(packs.map((p) => [p.id, p])), pr = new Map(prices.map((p) => [p.pack_id, p]))
  const catalog = variants.map((v) => ({ variant: v, pack: pk.get(v.pack_id)!, price: pr.get(v.pack_id) ?? null })).filter((c) => c.pack)
  if (!plan) return { plan, shops, orders: [], load: [], invoices: [], balances: {}, payments: [], catalog }
  const [orders, load, invoices, bal, pays] = await Promise.all([
    must<DOrder[]>(supabase.from('orders').select('id, shop_id, status, order_line(variant_id, qty_ordered, unit_price_paise)').eq('route_day_plan_id', plan.id).neq('status', 'cancelled')),
    must<Snapshot['load']>(supabase.from('load_line').select('variant_id, qty_ordered_total, qty_spare').eq('route_day_plan_id', plan.id)),
    must<DInvoice[]>(supabase.from('invoice').select('id, number, shop_id, total_paise, created_at, delivery_line(variant_id, qty_delivered, unit_price_paise)').eq('route_day_plan_id', plan.id)),
    must<{ shop_id: string; balance_paise: number }[]>(supabase.from('v_shop_balance').select('shop_id, balance_paise')),
    must<Snapshot['payments']>(supabase.from('ledger_entry').select('shop_id, amount_paise, payment_mode').eq('route_day_plan_id', plan.id).eq('type', 'payment')),
  ])
  return { plan, shops, orders, load, invoices, balances: Object.fromEntries(bal.map((b) => [b.shop_id, b.balance_paise])), payments: pays, catalog }
}

/** Live data when online, last saved copy when not. Always returns the queue so the UI can show pending work. */
export function useDriverDay() {
  const { profile } = useAuth()
  const uid = profile!.user_id
  const qc = useQueryClient()
  const [offline, setOffline] = useState(!navigator.onLine)
  const [queue, setQueue] = useState<QueuedAction[]>([])
  const refreshQueue = useCallback(() => void listQueue().then(setQueue), [])

  const q = useQuery({
    queryKey: ['driver-day', uid],
    queryFn: async () => {
      try {
        const s = await fetchSnapshot(); await saveSnapshot(uid, s); setOffline(false)
        return { snap: s, at: Date.now(), stale: false }
      } catch (err) {
        const saved = await loadSnapshot<Snapshot>(uid)
        if (saved) { setOffline(true); return { snap: saved.data, at: saved.at, stale: true } }
        throw err
      }
    },
    refetchInterval: 60_000, retry: 0, networkMode: 'always',
  })

  const sync = useCallback(async () => {
    const r = await syncQueue(); refreshQueue()
    if (r.offline) setOffline(true)
    if (r.synced) void qc.invalidateQueries({ queryKey: ['driver-day', uid] })
    return r
  }, [qc, uid, refreshQueue])

  useEffect(() => {
    const off = onQueueChange(refreshQueue)
    const goOnline = () => { setOffline(false); void sync() }
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline); window.addEventListener('offline', goOffline)
    const vis = () => { if (document.visibilityState === 'visible') void sync() }
    document.addEventListener('visibilitychange', vis)
    const t = setInterval(() => void sync(), 30_000)
    const first = setTimeout(() => void sync(), 0)
    return () => { clearTimeout(first); off(); window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); document.removeEventListener('visibilitychange', vis); clearInterval(t) }
  }, [refreshQueue, sync])

  return { ...q, snap: q.data?.snap, savedAt: q.data?.at, stale: q.data?.stale ?? false, offline, queue, sync }
}

/** What is left on the truck, counting deliveries already synced and those still queued. */
export function useTruckStock(snap: Snapshot | undefined, queue: QueuedAction[]) {
  return useMemo(() => {
    const left = new Map<string, number>()
    for (const l of snap?.load ?? []) left.set(l.variant_id, l.qty_ordered_total + l.qty_spare)
    for (const i of snap?.invoices ?? []) for (const d of i.delivery_line) left.set(d.variant_id, (left.get(d.variant_id) ?? 0) - d.qty_delivered)
    for (const a of queue) if (a.kind === 'delivery' && a.status === 'pending') {
      for (const l of a.args.p_lines as { variant_id: string; qty: number }[]) left.set(l.variant_id, (left.get(l.variant_id) ?? 0) - l.qty)
    }
    return left
  }, [snap, queue])
}

export const variantLabel = (c: { variant: Variant; pack: Pack }, hi: boolean) => {
  const pn = (hi && c.pack.name_hi) || c.pack.name_en
  return c.variant.flavour_en === c.pack.name_en ? pn : `${(hi && c.variant.flavour_hi) || c.variant.flavour_en} · ${pn}`
}
