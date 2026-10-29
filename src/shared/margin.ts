// Margin pricing (pure, unit-tested). All money in paise, quantities in cases.
// cost per case = fixed monthly costs / cases this month + loading + expected cash discount
// minimum = buy price + cost per case   (covers every expense)
// floor   = buy price + variable cost    (only covers this case; for filling empty truck space)

export interface Slab { min: number; off: number }
export interface BusinessSettings {
  fixed_costs: { label: string; paise: number }[]
  loading_paise_per_case: number; cash_discount_paise: number; on_time_pct: number
  default_margin_paise: number; truck_capacity: number; trips_per_day: number; working_days: number
  on_season_months: number[]; planned_cases_off: number; planned_cases_on: number
  slabs: { off: Slab[]; on: Slab[] }
}

export const fixedTotal = (s: BusinessSettings) => s.fixed_costs.reduce((a, c) => a + (c.paise || 0), 0)
export const variablePerCase = (s: BusinessSettings) => s.loading_paise_per_case + Math.round((s.cash_discount_paise * s.on_time_pct) / 100)

/** IST calendar month (1-12) and day. */
export function istParts(now = new Date()) {
  const [y, m, d] = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).split('-').map(Number)
  return { y, m, d, daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate() }
}
export const isOnSeason = (s: BusinessSettings, now = new Date()) => s.on_season_months.includes(istParts(now).m)

/**
 * Cases the month's fixed costs are spread over. From day 7 on, projected from real deliveries so far
 * (so discounts grow with volume); before that, the planned figure for the season.
 */
export function monthCases(s: BusinessSettings, deliveredSoFar: number, now = new Date()) {
  const { d, daysInMonth } = istParts(now)
  const planned = isOnSeason(s, now) ? s.planned_cases_on : s.planned_cases_off
  if (d >= 7 && deliveredSoFar > 0) return { cases: Math.round((deliveredSoFar * daysInMonth) / d), projected: true }
  return { cases: planned, projected: false }
}

export function costPerCase(s: BusinessSettings, cases: number) {
  const fixed = cases > 0 ? Math.round(fixedTotal(s) / cases) : fixedTotal(s)
  return { fixed, variable: variablePerCase(s), total: fixed + variablePerCase(s) }
}

/** Cases a month the fleet can carry when every truck is full on every trip. */
export const capacityCases = (s: BusinessSettings, trucks: number) => trucks * s.truck_capacity * s.trips_per_day * s.working_days

export interface PackPrice { trade: number; buy: number; buyKnown: boolean; margin: number; min: number; floor: number }

export function packPrice(s: BusinessSettings, trade: number, avgBuy: number | null, cost: { fixed: number; variable: number }): PackPrice {
  const buyKnown = !!avgBuy && avgBuy > 0
  const buy = buyKnown ? avgBuy! : Math.max(trade - s.default_margin_paise, 0)
  return { trade, buy, buyKnown, margin: trade - buy, floor: buy + cost.variable, min: buy + cost.variable + cost.fixed }
}

/** Discount per case for an order of `totalCases` (largest slab reached). */
export function slabOff(s: BusinessSettings, totalCases: number, onSeason: boolean) {
  const slabs = (onSeason ? s.slabs.on : s.slabs.off) ?? []
  return slabs.filter((x) => totalCases >= x.min).reduce((a, x) => Math.max(a, x.off), 0)
}

/**
 * Suggested price per case: trade price minus the slab, never below this pack's minimum,
 * and never above what the price list already charges.
 */
export function suggestedPrice(p: PackPrice, listPrice: number, off: number) {
  return Math.min(listPrice, Math.max(p.trade - off, p.min))
}

export type PriceLevel = 'ok' | 'belowMin' | 'belowFloor'
export const priceLevel = (p: PackPrice, price: number): PriceLevel => (price < p.floor ? 'belowFloor' : price < p.min ? 'belowMin' : 'ok')
