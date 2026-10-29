import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../shared/api/supabase'
import { must, type Pack, type PriceListItem, type Variant } from '../../shared/api/db'

export interface CatalogItem { pack: Pack; price: PriceListItem; variants: Variant[] }
export interface Delivery { plan_id: string; delivery_date: string; cutoff: string }
export interface OrderLine { id: string; variant_id: string; pack_id: string; qty_ordered: number; unit_price_paise: number; mrp_paise: number; units_per_case: number }
export interface Order {
  id: string; status: 'placed' | 'locked' | 'delivered' | 'partially_delivered' | 'cancelled'; source: string
  created_at: string; updated_at: string; cancel_reason: string | null
  route_day_plan: { id: string; date: string }; order_line: OrderLine[]
}

/** Live catalogue: active packs with a price in the live list, and their active flavours. */
export const useShopCatalog = () => useQuery({
  queryKey: ['shop-catalog'],
  queryFn: async (): Promise<CatalogItem[]> => {
    const [packs, variants, prices] = await Promise.all([
      must<Pack[]>(supabase.from('pack').select('*').eq('active', true).order('sort')),
      must<Variant[]>(supabase.from('variant').select('*').eq('active', true).order('sort')),
      must<PriceListItem[]>(supabase.from('price_list_item').select('*, price_list!inner(status)').eq('price_list.status', 'active')),
    ])
    const price = new Map(prices.map((p) => [p.pack_id, p]))
    return packs.filter((p) => price.has(p.id)).map((p) => ({
      pack: p, price: price.get(p.id)!, variants: variants.filter((v) => v.pack_id === p.id),
    })).filter((c) => c.variants.length > 0)
  },
  staleTime: 5 * 60_000,
})

export const useNextDelivery = () => useQuery({
  queryKey: ['next-delivery'],
  queryFn: async () => {
    const { data, error } = await supabase.rpc('next_delivery')
    if (error) throw error
    return ((data as Delivery[])[0] ?? null)
  },
  refetchInterval: 60_000,
})

export const useMyOrders = () => useQuery({
  queryKey: ['my-orders'],
  queryFn: () => must<Order[]>(supabase.from('orders')
    .select('id, status, source, created_at, updated_at, cancel_reason, route_day_plan(id, date), order_line(id, variant_id, pack_id, qty_ordered, unit_price_paise, mrp_paise, units_per_case)')
    .order('created_at', { ascending: false }).limit(30)),
})

export const orderTotal = (o: Pick<Order, 'order_line'>) => o.order_line.reduce((s, l) => s + l.qty_ordered * l.unit_price_paise, 0)
export const orderCases = (o: Pick<Order, 'order_line'>) => o.order_line.reduce((s, l) => s + l.qty_ordered, 0)
