import { useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'

export type AccountKind = 'company' | 'personal' | 'cash'
export interface MoneyAccount { id: string; name: string; kind: AccountKind; active: boolean; sort: number }
export interface MoneyPayment {
  kind: 'counter_sale' | 'payment'; ref_id: string; at: string; number: string; shop: string; mode: 'cash' | 'upi'
  amount_paise: number; account_id: string | null; account: string | null; account_kind: AccountKind | null; explicit: boolean
}
export interface Holding {
  account_id: string; name: string; kind: AccountKind; received_paise: number; moved_paise: number; holding_paise: number
  payments: number; oldest_at: string | null; oldest_days: number | null
}
export interface Transfer { id: string; account_id: string; account: string; amount_paise: number; moved_on: string; note: string | null; created_at: string; voided_at: string | null; void_reason: string | null }

/** Query keys to refresh after anything that moves money. */
export const MONEY_KEYS = ['money-payments', 'money-holdings', 'money-transfers']
export const refreshMoney = (qc: QueryClient) => { for (const k of MONEY_KEYS) void qc.invalidateQueries({ queryKey: [k] }) }

export const useMoneyAccounts = () => useQuery({
  queryKey: ['money-accounts'],
  queryFn: () => must<MoneyAccount[]>(supabase.rpc('money_accounts')),
  staleTime: 60_000,
})
export const useMoneyPayments = (from: string, to: string, enabled = true) => useQuery({
  queryKey: ['money-payments', from, to],
  enabled: enabled && !!from && !!to && from <= to,
  queryFn: () => must<MoneyPayment[]>(supabase.rpc('money_payments', { p_from: from, p_to: to })),
})
export const useMoneyHoldings = () => useQuery({
  queryKey: ['money-holdings'],
  queryFn: () => must<Holding[]>(supabase.rpc('money_holdings')),
  refetchInterval: 60_000,
})
export const useTransfers = () => useQuery({
  queryKey: ['money-transfers'],
  queryFn: () => must<Transfer[]>(supabase.rpc('money_transfers')),
})

/** Same default as the database: cash -> first Cash account, UPI -> first Company bank account. */
export function defaultAccount(accounts: MoneyAccount[] | undefined, mode: 'cash' | 'upi') {
  const want: AccountKind = mode === 'cash' ? 'cash' : 'company'
  return (accounts ?? []).filter((a) => a.active && a.kind === want).sort((a, b) => a.sort - b.sort)[0]?.id ?? ''
}
