import { useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'

export type PlanStatus = 'planning' | 'loaded' | 'out' | 'closed'

/** One card per active vehicle on the Loading board (trip_board). */
export interface TripCard {
  vehicle_id: string; vehicle: string; capacity: number
  plan_id: string | null; route: string | null; status: PlanStatus | null; driver: string | null
  loaded_at: string | null; unloaded_at: string | null; closed_at: string | null
  short_cases: number | null; close_note: string | null
  orders: number; ordered_cases: number; loaded: number; returned: number; sold: number; left: number; sales_paise: number
}
export interface TripItem {
  variant_id: string; label: string; brand: string | null; pack_sort: number; godown: number
  ordered: number; loaded: number; returned: number; delivered: number; billed: number; left: number
}
export interface TripOrder {
  id: string; status: 'placed' | 'locked' | 'delivered' | 'partially_delivered'; shop_id: string; shop: string; owner: string | null
  phone: string | null; stop_seq: number; lines: { variant_id: string; label: string; qty: number; price_paise: number }[]
  total_paise: number; delivered_paise: number
}
export interface TripBill { id: string; number: string; shop: string; owner: string | null; total_paise: number; mode: 'cash' | 'upi'; cases: number; at: string }
export interface TripDetail {
  plan: {
    id: string; date: string; status: PlanStatus; route: string; vehicle_id: string | null; vehicle: string | null; capacity: number | null
    driver_id: string | null; driver: string | null; unloaded_at: string | null; closed_at: string | null; short_cases: number | null; close_note: string | null
  }
  items: TripItem[]; orders: TripOrder[]; bills: TripBill[]
}

/** Where a trip is in its day. */
export type Stage = 'load' | 'onRoad' | 'back' | 'closed'
export const stageOf = (status: PlanStatus | null | undefined, unloadedAt: string | null | undefined): Stage =>
  !status || status === 'planning' ? 'load' : status === 'closed' ? 'closed' : unloadedAt ? 'back' : 'onRoad'

export const useTripBoard = (date: string) => useQuery({
  queryKey: ['trip-board', date],
  queryFn: () => must<TripCard[]>(supabase.rpc('trip_board', { p_date: date })),
  refetchInterval: 30_000,
})

export const useTripDetail = (planId: string | null | undefined) => useQuery({
  queryKey: ['trip-detail', planId],
  enabled: !!planId,
  queryFn: () => must<TripDetail>(supabase.rpc('trip_detail', { p_plan: planId! })),
})

/** Everything a trip action can change: stock, bills, orders, khata, money. */
export const refreshTrips = (qc: QueryClient) => {
  for (const k of ['trip-board', 'trip-detail', 'plans', 'stock', 'stock_move', 'counter-sales', 'counter-catalog', 'admin-orders', 'route-load', 'load-lines', 'month_stats', 'khata', 'closings'])
    void qc.invalidateQueries({ queryKey: [k] })
}

export const sumBy = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0)

/** Loading history row (trip_history RPC): one loaded trip, with who loaded it and when. */
export interface TripHistoryRow {
  id: string; date: string; status: PlanStatus; route: string; vehicle: string | null; driver: string | null
  loaded: number; returned: number; items: number; loaded_at: string | null; loaded_by: string | null
  unloaded_at: string | null; closed_at: string | null; short_cases: number | null
}
export const useTripHistory = (from: string, to: string) => useQuery({
  queryKey: ['trip-history', from, to],
  queryFn: () => must<TripHistoryRow[]>(supabase.rpc('trip_history', { p_from: from, p_to: to })),
})
