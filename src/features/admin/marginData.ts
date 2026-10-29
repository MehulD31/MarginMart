import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../shared/api/supabase'
import { must, usePacks, useStock, useVariants, useVehicles, type PriceListItem } from '../../shared/api/db'
import { costPerCase, isOnSeason, monthCases, packPrice, type BusinessSettings, type PackPrice } from '../../shared/margin'

export const useBusinessSettings = () => useQuery({
  queryKey: ['business_settings'],
  queryFn: () => must<BusinessSettings>(supabase.from('business_settings').select('*').eq('id', 1).single()),
})

export const useMonthStats = () => useQuery({
  queryKey: ['month_stats'],
  queryFn: async () => {
    const rows = await must<{ cases: number; sales_paise: number; cost_paise: number }[]>(supabase.rpc('month_stats'))
    return rows[0] ?? { cases: 0, sales_paise: 0, cost_paise: 0 }
  },
  refetchInterval: 300_000,
})

const useActivePrices = () => useQuery({
  queryKey: ['price_list_item', 'active'],
  queryFn: () => must<(PriceListItem & { price_list: { status: string } })[]>(supabase.from('price_list_item').select('*, price_list!inner(status)').eq('price_list.status', 'active')),
})

/** Everything needed to price a case: settings, this month's cost per case, and each pack's minimum and floor. */
export function useMargin() {
  const settings = useBusinessSettings(); const stats = useMonthStats(); const stock = useStock()
  const prices = useActivePrices(); const packs = usePacks(); const variants = useVariants(); const vehicles = useVehicles()
  return useMemo(() => {
    const s = settings.data
    if (!s || !stats.data || !prices.data || !variants.data || !stock.data) return null
    const onSeason = isOnSeason(s)
    const volume = monthCases(s, stats.data.cases)
    const cost = costPerCase(s, volume.cases)
    const avg = new Map<string, number[]>()
    const cost0 = new Map(stock.data.map((x) => [x.variant_id, x.avg_cost_paise]))
    for (const v of variants.data) { const c = cost0.get(v.id); if (c) avg.set(v.pack_id, [...(avg.get(v.pack_id) ?? []), c]) }
    const byPack = new Map<string, PackPrice>()
    for (const i of prices.data) {
      const a = avg.get(i.pack_id)
      byPack.set(i.pack_id, packPrice(s, i.trade_price_paise, a ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null, cost))
    }
    const packOf = new Map(variants.data.map((v) => [v.id, v.pack_id]))
    const trucks = (vehicles.data ?? []).filter((v) => v.active).length
    return { s, onSeason, volume, cost, byPack, packOf, stats: stats.data, prices: prices.data, packs: packs.data ?? [], trucks,
      forVariant: (id: string) => byPack.get(packOf.get(id) ?? '') }
  }, [settings.data, stats.data, prices.data, variants.data, stock.data, packs.data, vehicles.data])
}
