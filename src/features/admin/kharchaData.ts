import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { formatPaise } from '../../shared/money'
import type { KharchaSettings, PnlInput } from '../../shared/kharcha.js'

export interface Expense { id: string; spent_on: string; amount_paise: number; category: string; budget_line: string; note: string | null; paid_from: string; source: string; created_at: string }
export const monthStart = (d: string) => d.slice(0, 8) + '01'
export const r100 = (p: number) => formatPaise(Math.round(p / 100) * 100)

export const useKharchaSettings = () => useQuery({
  queryKey: ['business_settings'],
  queryFn: () => must<KharchaSettings & { id: number }>(supabase.from('business_settings').select('*').eq('id', 1).single()),
})
export const usePnl = (from: string, to: string) => useQuery({
  queryKey: ['pnl', from, to],
  queryFn: async () => (await must<PnlInput[]>(supabase.rpc('pnl_range', { p_from: from, p_to: to })))[0] ?? { cases: 0, sales_paise: 0, cost_paise: 0, active_days: 0 },
  refetchInterval: 60_000,
})
export const useExpenses = (from: string, to: string) => useQuery({
  queryKey: ['expense', from, to],
  queryFn: () => must<Expense[]>(supabase.from('expense').select('*').is('voided_at', null).gte('spent_on', from).lte('spent_on', to).order('spent_on', { ascending: false }).order('created_at', { ascending: false })),
})

