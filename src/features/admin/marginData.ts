import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../shared/api/supabase'
import { loadBusinessSettings, must, usePacks, useStock, useVariants, useVehicles, type PriceListItem } from '../../shared/api/db'
import { costPerCase, isOnSeason, monthCases, packPrice, schemeFor, withFunding, type BusinessSettings, type PackPrice, type Scheme } from '../../shared/margin'
import { todayIST } from './opsData'

export const useBusinessSettings = () => useQuery({
  queryKey: ['business_settings'],
  queryFn: () => loadBusinessSettings<BusinessSettings>(),
})

export const useMonthStats = () => useQuery({
  queryKey: ['month_stats'],
  queryFn: async () => {
    const rows = await must<{ cases: number; sales_paise: number; cost_paise: number }[]>(supabase.rpc('month_stats'))
    return rows[0] ?? { cases: 0, sales_paise: 0, cost_paise: 0 }
  },
  refetchInterval: 300_000,
})

/** Schemes not yet over (running or upcoming), newest first. */
export const useSchemes = (all = false) => useQuery({
  queryKey: ['scheme', all],
  queryFn: () => {
    let q = supabase.from('scheme').select('*').order('starts_on', { ascending: false }).order('created_at', { ascending: false })
    if (!all) q = q.eq('active', true).gte('ends_on', todayIST())
    return must<Scheme[]>(q.limit(200))
  },
})

const useActivePrices = () => useQuery({
  queryKey: ['price_list_item', 'active'],
  queryFn: () => must<(PriceListItem & { price_list: { status: string } })[]>(supabase.from('price_list_item').select('*, price_list!inner(status)').eq('price_list.status', 'active')),
})

/** What the Pepsi portal charges us per case (with GST), per flavour. Used when no purchase has set a real cost yet. */
const usePortalCosts = () => useQuery({
  queryKey: ['oms_cost'],
  queryFn: async () => {
    const [map, sku] = await Promise.all([
      must<{ variant_id: string; sku_code: string }[]>(supabase.from('oms_map').select('variant_id, sku_code')),
      must<{ sku_code: string; price_paise: number | null }[]>(supabase.from('oms_sku').select('sku_code, price_paise')),
    ])
    const price = new Map(sku.map((x) => [x.sku_code, x.price_paise ?? 0]))
    const out = new Map<string, number>()
    for (const m of map) { const p = price.get(m.sku_code); if (p && p > 0) out.set(m.variant_id, p) }
    return out
  },
})

/** Everything needed to price a case: settings, this month's cost per case, and each pack's minimum and floor. */
export function useMargin() {
  const portal = usePortalCosts()
  const settings = useBusinessSettings(); const stats = useMonthStats(); const stock = useStock()
  const prices = useActivePrices(); const packs = usePacks(); const variants = useVariants(); const vehicles = useVehicles()
  const schemes = useSchemes()
  return useMemo(() => {
    const s = settings.data
    if (!s || !stats.data || !prices.data || !variants.data || !stock.data) return null
    const onSeason = isOnSeason(s)
    const volume = monthCases(s, stats.data.cases)
    const cost = costPerCase(s, volume.cases)
    const avg = new Map<string, number[]>()
    const cost0 = new Map(stock.data.map((x) => [x.variant_id, x.avg_cost_paise]))
    for (const v of variants.data) { const c = cost0.get(v.id); if (c) avg.set(v.pack_id, [...(avg.get(v.pack_id) ?? []), c]) }
    // No purchase cost for a pack yet: the Pepsi portal's own price per case is the real cost, better than a guess.
    const fromPortal = new Map<string, number[]>()
    for (const v of variants.data) { const c = portal.data?.get(v.id); if (c && !avg.has(v.pack_id)) fromPortal.set(v.pack_id, [...(fromPortal.get(v.pack_id) ?? []), c]) }
    const byPack = new Map<string, PackPrice>()
    for (const i of prices.data) {
      const a = avg.get(i.pack_id) ?? fromPortal.get(i.pack_id)
      byPack.set(i.pack_id, packPrice(s, i.trade_price_paise, a ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null, cost))
    }
    const packOf = new Map(variants.data.map((v) => [v.id, v.pack_id]))
    const trucks = (vehicles.data ?? []).filter((v) => v.active).length
    const today = todayIST()
    const live = schemes.data ?? []
    const schemeOf = (id: string) => schemeFor(live, packOf.get(id) ?? '', id, today)
    // Base price (no scheme), for working out the slab price.
    const baseFor = (id: string) => byPack.get(packOf.get(id) ?? '')
    return { s, onSeason, volume, cost, byPack, packOf, stats: stats.data, prices: prices.data, packs: packs.data ?? [], trucks,
      schemes: live, schemeOf, baseFor,
      // Minimum and floor for this flavour today, after any Pepsi-funded scheme.
      forVariant: (id: string) => { const p = baseFor(id); return p && withFunding(p, schemeOf(id).funded) } }
  }, [settings.data, stats.data, prices.data, variants.data, stock.data, packs.data, vehicles.data, schemes.data, portal.data])
}
