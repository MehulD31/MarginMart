import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { analyze } from '../../shared/insights.js'

/** Every real sale (counter, truck, delivered orders) analysed once; shared by the dashboard boxes. */
export const useInsights = () => useQuery({
  queryKey: ['insights'],
  queryFn: async () => analyze(await must<unknown>(supabase.rpc('insights_data', { p_days: 90 }))),
  refetchInterval: 120_000,
})
