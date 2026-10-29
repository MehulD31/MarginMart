import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { usePacks, useStock, useVariants, type Stock } from '../../shared/api/db'
import { formatPaise } from '../../shared/money'

export interface StockRow extends Stock { name: string; sub: string; active: boolean }

/** Every flavour with its stock (0 if never stocked), labelled "Flavour · Pack". */
export function useStockRows() {
  const packs = usePacks(); const variants = useVariants(); const stock = useStock()
  const { t, i18n } = useTranslation()
  const hi = i18n.language === 'hi'
  const rows = useMemo<StockRow[]>(() => {
    const pk = new Map(packs.data?.map((p) => [p.id, p]))
    const st = new Map(stock.data?.map((s) => [s.variant_id, s]))
    return (variants.data ?? []).map((v) => {
      const p = pk.get(v.pack_id)
      const pn = (hi && p?.name_hi) || p?.name_en || ''
      const s = st.get(v.id) ?? { variant_id: v.id, on_hand: 0, low_threshold: 0, avg_cost_paise: 0, updated_at: '' }
      return {
        ...s,
        name: v.flavour_en !== p?.name_en ? `${(hi && v.flavour_hi) || v.flavour_en} · ${pn}` : pn,
        sub: p ? `${t('catalog.caseOf', { n: p.units_per_case })} · MRP ${formatPaise(p.mrp_paise)}` : '',
        active: v.active && !!p?.active,
      }
    })
  }, [packs.data, variants.data, stock.data, hi, t])
  return { rows, isLoading: packs.isLoading || variants.isLoading || stock.isLoading }
}
