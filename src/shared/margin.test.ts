import { describe, expect, it } from 'vitest'
import { costPerCase, monthCases, packPrice, priceLevel, slabOff, suggestedPrice, type BusinessSettings } from './margin'

const s: BusinessSettings = {
  fixed_costs: [{ label: 'all', paise: 17_000_000 }], loading_paise_per_case: 125, cash_discount_paise: 100, on_time_pct: 70,
  default_margin_paise: 3500, truck_capacity: 120, trips_per_day: 2, working_days: 26, on_season_months: [3, 4, 5, 6, 7, 8],
  planned_cases_off: 10000, planned_cases_on: 18720,
  slabs: { off: [{ min: 5, off: 500 }, { min: 10, off: 1000 }], on: [{ min: 5, off: 800 }, { min: 10, off: 1500 }] },
}
const oct = new Date('2026-10-03T06:00:00Z')

describe('margin', () => {
  it('uses the planned volume early in the month and projects later', () => {
    expect(monthCases(s, 500, oct)).toEqual({ cases: 10000, projected: false })
    expect(monthCases(s, 3100, new Date('2026-10-10T06:00:00Z'))).toEqual({ cases: 9610, projected: true })
  })
  it('Aquafina 1L off-season: min ₹124.95, floor ₹106.95', () => {
    const cost = costPerCase(s, 10000)
    expect(cost).toEqual({ fixed: 1700, variable: 195, total: 1895 })
    const p = packPrice(s, 14000, 10500, cost)
    expect(p.min).toBe(12395)
    expect(p.floor).toBe(10695)
    expect(priceLevel(p, 13000)).toBe('ok')
    expect(priceLevel(p, 12000)).toBe('belowMin')
    expect(priceLevel(p, 10000)).toBe('belowFloor')
  })
  it('slabs pick the largest step reached and never go below the minimum', () => {
    expect(slabOff(s, 4, false)).toBe(0)
    expect(slabOff(s, 12, false)).toBe(1000)
    expect(slabOff(s, 12, true)).toBe(1500)
    const p = packPrice(s, 14000, 13000, costPerCase(s, 10000))
    expect(suggestedPrice(p, 13500, 1000)).toBe(13500)
  })
})
