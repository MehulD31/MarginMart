import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export interface Route { id: string; name: string; visit_days: number[]; active: boolean }
export interface Vehicle { id: string; name: string; reg_no: string | null; capacity_cases: number; active: boolean }
export interface Pack {
  id: string; brand_id: string; name_en: string; name_hi: string | null; units_per_case: number
  mrp_paise: number; hsn: string | null; gst_rate_bp: number; cess_rate_bp: number
  is_returnable: boolean; sort: number; active: boolean; source_name: string | null
}
export interface Variant {
  id: string; pack_id: string; flavour_en: string; flavour_hi: string | null
  image_path: string | null; sort: number; active: boolean
}
export interface PriceList {
  id: string; name: string; effective_from: string; price_includes_gst: boolean
  status: 'draft' | 'active' | 'archived'; activated_at: string | null; created_at: string
}
export interface PriceListItem {
  id: string; price_list_id: string; pack_id: string; trade_price_paise: number
  scheme_value_paise: number; scheme_type: 'net_rate' | 'bogo_on_mrp'; net_rate_paise: number; remarks: string | null
}
export interface Shop {
  id: string; code: string | null; name: string; owner_name: string | null; phone: string | null
  alt_phone: string | null; address: string | null; gstin: string | null; route_id: string; stop_seq: number
  credit_limit_paise: number; credit_days: number; active: boolean
}

/** Throws the Supabase error so React Query / errorMessage can show it. */
export async function must<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

export const useRoutes = () => useQuery({
  queryKey: ['route'],
  queryFn: () => must<Route[]>(supabase.from('route').select('*').order('name')),
})
export const useVehicles = () => useQuery({
  queryKey: ['vehicle'],
  queryFn: () => must<Vehicle[]>(supabase.from('vehicle').select('*').order('name')),
})
export const usePacks = () => useQuery({
  queryKey: ['pack'],
  queryFn: () => must<Pack[]>(supabase.from('pack').select('*').order('sort').order('name_en')),
})
export const useVariants = () => useQuery({
  queryKey: ['variant'],
  queryFn: () => must<Variant[]>(supabase.from('variant').select('*').order('sort').order('flavour_en')),
})

export const imageUrl = (path: string | null) =>
  path ? supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl : null

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const
