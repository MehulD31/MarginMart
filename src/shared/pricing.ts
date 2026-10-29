// Pricing rules from the PepsiCo sheet (PRD §4). All values in paise, per case.

export interface PackPrice {
  units_per_case: number
  mrp_paise: number            // per unit (bottle/can)
  trade_price_paise: number    // per case
  scheme_value_paise: number   // per case
}

/** What the shop pays per case. */
export const netRate = (p: Pick<PackPrice, 'trade_price_paise' | 'scheme_value_paise'>): number => p.trade_price_paise - p.scheme_value_paise

/** The shop's margin per case when it sells every unit at MRP. */
export const shopMargin = (p: PackPrice): number => p.mrp_paise * p.units_per_case - netRate(p)

/** Margin as a percentage of the MRP value of the case, one decimal. */
export const shopMarginPct = (p: PackPrice): number => {
  const mrpValue = p.mrp_paise * p.units_per_case
  return mrpValue === 0 ? 0 : Math.round((shopMargin(p) / mrpValue) * 1000) / 10
}

/** Parses "₹1,051.50" / "1051" / 1051 into paise. Returns null for blanks or junk. */
export function parseRupees(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null
  const s = String(v ?? '').replace(/[₹,\s]/g, '')
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null
  return Math.round(Number(s) * 100)
}
