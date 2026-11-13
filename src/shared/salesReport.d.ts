export interface SalesReport {
  from: string; to: string; first_sale: string | null; last_sale: string | null
  totals: { bills: number; shops: number; days: number; items: number; cases: number; units: number; gross_paise: number; discount_paise: number; net_paise: number; cost_paise: number; margin_paise: number }
  by_mode: { mode: string; bills: number; net: number }[]
  by_channel: { channel: string; bills: number; cases: number; net: number }[]
  by_item: { item: string; brand: string; cases: number; units: number; amount_paise: number; avg_rate_paise: number; margin_paise: number; bills: number; shops: number; first_sold: string; last_sold: string }[]
  by_brand: { brand: string; cases: number; amount_paise: number }[]
  by_day: { dy: string; bills: number; cases: number; amount_paise: number }[]
  top_shops: { name: string; locality: string | null; bills: number; cases: number; amount_paise: number }[]
}
export function rupees(p: number | null | undefined, dec?: number): string
export function niceDate(iso: string | null | undefined): string
export function itemName(s: string): string
export function periodOf(kind: string, todayIso: string): { from: string; to: string; label: string }
export function reportHtml(r: SalesReport, opts?: { title?: string; label?: string; generatedAt?: string; showMargin?: boolean }): string
