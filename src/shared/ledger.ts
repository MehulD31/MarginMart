import { useQuery } from '@tanstack/react-query'
import { supabase } from './api/supabase'
import { must } from './api/db'

export interface LedgerEntry {
  id: string; shop_id: string; type: 'invoice' | 'payment' | 'adjustment' | 'reversal' | 'opening'
  amount_paise: number; payment_mode: 'cash' | 'upi' | null; upi_ref: string | null; note: string | null
  invoice_id: string | null; reverses_id: string | null; created_at: string
}
export interface CreditStatus { balance_paise: number; overdue_paise: number; credit_limit_paise: number; blocked: boolean; override_until: string | null }
export interface Bill { id: string; number: string; total_paise: number; status: string; created_at: string; delivery_line: { variant_id: string; qty_ordered: number; qty_delivered: number; unit_price_paise: number }[] }

export const useLedger = (shopId: string | null | undefined) => useQuery({
  queryKey: ['ledger', shopId],
  enabled: !!shopId,
  queryFn: () => must<LedgerEntry[]>(supabase.from('ledger_entry').select('*').eq('shop_id', shopId!).order('created_at', { ascending: false }).limit(200)),
})

export const useCreditStatus = (shopId?: string) => useQuery({
  queryKey: ['credit-status', shopId ?? 'me'],
  queryFn: async () => {
    const { data, error } = await supabase.rpc('credit_status', shopId ? { p_shop_id: shopId } : {})
    if (error) throw error
    return (data as CreditStatus[])[0]
  },
})

export const useBills = (shopId: string | null | undefined) => useQuery({
  queryKey: ['bills', shopId],
  enabled: !!shopId,
  queryFn: () => must<Bill[]>(supabase.from('invoice').select('id, number, total_paise, status, created_at, delivery_line(variant_id, qty_ordered, qty_delivered, unit_price_paise)')
    .eq('shop_id', shopId!).order('created_at', { ascending: false }).limit(50)),
})

/** Running balance after each entry, oldest → newest, for the khata view. */
export function withRunning(entries: LedgerEntry[]) {
  let run = 0
  return [...entries].reverse().map((e) => ({ ...e, running: (run += e.amount_paise) })).reverse()
}
