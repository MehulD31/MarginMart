import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'

export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

export interface Plan {
  id: string; route_id: string; date: string; status: 'planning' | 'loaded' | 'out' | 'closed'
  vehicle_id: string | null; driver_id: string | null; route: { name: string }
}
export interface AdminOrder {
  id: string; status: 'placed' | 'locked' | 'delivered' | 'partially_delivered' | 'cancelled'; source: 'shop' | 'manager' | 'driver_van'
  created_at: string; updated_at: string; shop_id: string; route_day_plan_id: string; cancel_reason: string | null
  shop: { name: string; owner_name: string | null; phone: string | null; stop_seq: number }
  order_line: { variant_id: string; qty_ordered: number; unit_price_paise: number }[]
}
export interface LoadLine { variant_id: string; qty_ordered_total: number; qty_spare: number }

/** Delivery days from today for two weeks, every route. */
export const usePlans = () => useQuery({
  queryKey: ['plans'],
  queryFn: () => must<Plan[]>(supabase.from('route_day_plan').select('id, route_id, date, status, vehicle_id, driver_id, route(name)')
    .gte('date', todayIST()).lte('date', addDays(todayIST(), 14)).order('date')),
})

export const useOrdersFor = (planIds: string[]) => useQuery({
  queryKey: ['admin-orders', planIds],
  enabled: planIds.length > 0,
  queryFn: () => must<AdminOrder[]>(supabase.from('orders')
    .select('id, status, source, created_at, updated_at, shop_id, route_day_plan_id, cancel_reason, shop(name, owner_name, phone, stop_seq), order_line(variant_id, qty_ordered, unit_price_paise)')
    .in('route_day_plan_id', planIds).order('created_at')),
})

/** Count of live (non-cancelled) orders per upcoming plan, so the Orders page can
 *  badge each delivery day and default to the nearest day that actually has orders. */
export const useOrderCounts = (planIds: string[]) => useQuery({
  queryKey: ['admin-order-counts', planIds],
  enabled: planIds.length > 0,
  queryFn: () => must<{ route_day_plan_id: string }[]>(supabase.from('orders')
    .select('route_day_plan_id').in('route_day_plan_id', planIds).neq('status', 'cancelled')),
  select: (rows) => rows.reduce<Record<string, number>>((m, r) => {
    m[r.route_day_plan_id] = (m[r.route_day_plan_id] ?? 0) + 1; return m
  }, {}),
})

export const useLoadLines = (planId: string | null) => useQuery({
  queryKey: ['load-lines', planId],
  enabled: !!planId,
  queryFn: () => must<LoadLine[]>(supabase.from('load_line').select('variant_id, qty_ordered_total, qty_spare').eq('route_day_plan_id', planId!)),
})

export const useDrivers = () => useQuery({
  queryKey: ['profiles', 'drivers'],
  queryFn: () => must<{ user_id: string; name: string; phone: string }[]>(supabase.from('profiles').select('user_id, name, phone').eq('role', 'driver').eq('active', true).order('name')),
})

export const linesTotal = (o: Pick<AdminOrder, 'order_line'>) => o.order_line.reduce((s, l) => s + l.qty_ordered * l.unit_price_paise, 0)
export const linesCases = (o: Pick<AdminOrder, 'order_line'>) => o.order_line.reduce((s, l) => s + l.qty_ordered, 0)
export const isLive = (o: AdminOrder) => o.status !== 'cancelled'

/** Distinct upcoming delivery dates, nearest first. */
export const planDates = (plans: Plan[]) => [...new Set(plans.map((p) => p.date))]

/** Live-order count per delivery date, summed across every route's plan on that day. */
export const ordersByDate = (plans: Plan[], countByPlan: Record<string, number>) =>
  plans.reduce<Record<string, number>>((m, p) => {
    const n = countByPlan[p.id] ?? 0
    if (n) m[p.date] = (m[p.date] ?? 0) + n
    return m
  }, {})

export const CANCEL_REASONS = ['shop_asked', 'shop_closed', 'out_of_stock', 'credit_hold', 'duplicate', 'other'] as const

export const useLocaleDate = () => {
  const { i18n } = useTranslation()
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'
  return (iso: string, long = false) => new Date(`${iso}T00:00:00`).toLocaleDateString(loc, long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' })
}
