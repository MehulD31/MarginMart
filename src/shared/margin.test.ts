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
    // the trade price is the most a shop pays: even when the minimum is higher, the price is never above it
    expect(suggestedPrice(p, p.min - 5000, 0)).toBe(p.min - 5000)
    expect(suggestedPrice(p, p.min - 5000, 1000)).toBe(p.min - 5000)
  })
})

import { schemeFor, schemePrice, withFunding, type Scheme } from './margin'

describe('schemes', () => {
  const sch = (o: Partial<Scheme>): Scheme => ({ id: 'x', pack_id: 'p400', variant_ids: null, kind: 'pass_through', amount_paise: 1000,
    starts_on: '2026-11-05', ends_on: '2026-11-08', active: true, note: null, ...o })
  it('applies only between the dates, to the right flavours, and not when ended early', () => {
    expect(schemeFor([sch({})], 'p400', 'pepsi', '2026-11-06').off).toBe(1000)
    expect(schemeFor([sch({})], 'p400', 'pepsi', '2026-11-09').off).toBe(0)
    expect(schemeFor([sch({ variant_ids: ['dew'] })], 'p400', 'pepsi', '2026-11-06').off).toBe(0)
    expect(schemeFor([sch({ active: false })], 'p400', 'pepsi', '2026-11-06').off).toBe(0)
    expect(schemeFor([sch({ kind: 'our_discount' })], 'p400', 'pepsi', '2026-11-06')).toMatchObject({ off: 1000, funded: 0 })
  })
  it('a Pepsi-funded ₹10 lowers buy, minimum and floor, and the order price', () => {
    const p = packPrice(s, 53000, 49150, costPerCase(s, 10000))
    const q = withFunding(p, 1000)
    expect(q.buy).toBe(48150); expect(q.min).toBe(p.min - 1000); expect(q.floor).toBe(p.floor - 1000)
    expect(schemePrice(p, 53000, 0, 1000)).toBe(52000)
    expect(priceLevel(q, 52000)).toBe('ok')
  })
})
